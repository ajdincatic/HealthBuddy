// Initialize alarms
chrome.runtime.onInstalled.addListener(function() {
  setupAlarms();
});

// Listen for alarm updates
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'updateAlarms') {
    setupAlarms();
  }
});

// Setup alarms based on settings
function setupAlarms() {
  chrome.storage.sync.get(
    {
      standupInterval: 30,
      waterInterval: 45,
      eyeInterval: 20
    },
    function(settings) {
      // Clear existing alarms
      chrome.alarms.clearAll();

      // Create new alarms
      chrome.alarms.create('Standup', { periodInMinutes: settings.standupInterval });
      chrome.alarms.create('Water', { periodInMinutes: settings.waterInterval });
      chrome.alarms.create('Eye', { periodInMinutes: settings.eyeInterval });
    }
  );
}

// Handle snooze request
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'snoozeAll') {
    chrome.alarms.getAll(function(alarms) {
      alarms.forEach(alarm => {
        const newTime = Date.now() + 30 * 60 * 1000; // 30 minutes
        chrome.alarms.create(alarm.name, {
          when: newTime,
          periodInMinutes: parseInt(alarm.periodInMinutes)
        });
      });
    });
  }
});

// Check quiet hours before showing notification
function isQuietHours() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      quietStart: '22:00',
      quietEnd: '09:00'
    }, function(items) {
      const now = new Date();
      const start = new Date();
      const end = new Date();
      
      const [startHours, startMinutes] = items.quietStart.split(':');
      const [endHours, endMinutes] = items.quietEnd.split(':');
      
      start.setHours(parseInt(startHours), parseInt(startMinutes), 0);
      end.setHours(parseInt(endHours), parseInt(endMinutes), 0);
      
      if (end < start) {
        // Quiet hours span midnight
        if (now >= start || now < end) {
          resolve(true);
        }
      } else {
        // Quiet hours within same day
        if (now >= start && now < end) {
          resolve(true);
        }
      }
      resolve(false);
    });
  });
}

// Update alarm handler
chrome.alarms.onAlarm.addListener(async function(alarm) {
  // Check if alarm type is enabled
  const settings = await chrome.storage.sync.get({
    standupEnabled: true,
    waterEnabled: true,
    eyeEnabled: true
  });
  
  const enabledMap = {
    'Standup': settings.standupEnabled,
    'Water': settings.waterEnabled,
    'Eye': settings.eyeEnabled
  };
  
  if (!enabledMap[alarm.name]) {
    return;
  }
  
  // Check quiet hours
  if (await isQuietHours()) {
    return;
  }
  
  // Update stats
  chrome.storage.sync.get({
    todayBreaks: 0,
    currentStreak: 0,
    lastBreakDate: null
  }, function(items) {
    const today = new Date().toDateString();
    const lastBreak = items.lastBreakDate ? new Date(items.lastBreakDate).toDateString() : null;
    
    if (lastBreak !== today) {
      // New day, reset counter and potentially update streak
      chrome.storage.sync.set({
        todayBreaks: 1,
        currentStreak: lastBreak ? items.currentStreak + 1 : 1,
        lastBreakDate: new Date().toISOString()
      });
    } else {
      // Same day, increment counter
      chrome.storage.sync.set({
        todayBreaks: items.todayBreaks + 1,
        lastBreakDate: new Date().toISOString()
      });
    }
  });
  
  let message = '';
  let title = 'HealthBuddy Reminder';

  switch(alarm.name) {
    case 'Standup':
      message = 'Time to stand up and stretch! Take a short walk around.';
      break;
    case 'Water':
      message = 'Stay hydrated! Time to drink some water.';
      break;
    case 'Eye':
      message = 'Give your eyes a break! Look at something 20 feet away for 20 seconds (20-20-20 rule).';
      break;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2
  });
}); 