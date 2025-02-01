document.addEventListener('DOMContentLoaded', function() {
  // Load saved settings
  chrome.storage.sync.get(
    {
      standupInterval: 30,
      waterInterval: 45,
      eyeInterval: 20,
      quietStart: '22:00',
      quietEnd: '09:00',
      standupEnabled: true,
      waterEnabled: true,
      eyeEnabled: true,
      use24Hour: true
    },
    function(items) {
      document.getElementById('standupInterval').value = items.standupInterval;
      document.getElementById('waterInterval').value = items.waterInterval;
      document.getElementById('eyeInterval').value = items.eyeInterval;
      document.getElementById('quietStart').value = items.quietStart;
      document.getElementById('quietEnd').value = items.quietEnd;
      document.getElementById('standupEnabled').checked = items.standupEnabled;
      document.getElementById('waterEnabled').checked = items.waterEnabled;
      document.getElementById('eyeEnabled').checked = items.eyeEnabled;
      document.getElementById('use24Hour').checked = items.use24Hour;
      
      // Initialize status display
      updateNextReminders();
      updateTimeDisplays(items.use24Hour);
    }
  );

  // Load stats
  chrome.storage.sync.get({
    todayBreaks: 0,
    currentStreak: 0,
    lastBreakDate: null
  }, function(items) {
    document.getElementById('todayBreaks').textContent = items.todayBreaks;
    document.getElementById('currentStreak').textContent = items.currentStreak;
    
    // Check and update streak
    const today = new Date().toDateString();
    const lastBreak = items.lastBreakDate ? new Date(items.lastBreakDate).toDateString() : null;
    
    if (lastBreak && lastBreak !== today) {
      const dayDiff = Math.floor((new Date() - new Date(lastBreak)) / (1000 * 60 * 60 * 24));
      if (dayDiff > 1) {
        // Reset streak if more than one day has passed
        chrome.storage.sync.set({ currentStreak: 0 });
        document.getElementById('currentStreak').textContent = '0';
      }
    }
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', function() {
    const settings = {
      standupInterval: parseInt(document.getElementById('standupInterval').value),
      waterInterval: parseInt(document.getElementById('waterInterval').value),
      eyeInterval: parseInt(document.getElementById('eyeInterval').value),
      quietStart: document.getElementById('quietStart').value,
      quietEnd: document.getElementById('quietEnd').value,
      standupEnabled: document.getElementById('standupEnabled').checked,
      waterEnabled: document.getElementById('waterEnabled').checked,
      eyeEnabled: document.getElementById('eyeEnabled').checked,
      use24Hour: document.getElementById('use24Hour').checked
    };

    chrome.storage.sync.set(settings, function() {
      chrome.runtime.sendMessage({ action: 'updateAlarms', settings });
      
      // Show success message
      const button = document.getElementById('saveSettings');
      const originalText = button.textContent;
      button.textContent = 'Saved!';
      button.disabled = true;
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    });
  });

  // Snooze all reminders
  document.getElementById('snoozeAll').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'snoozeAll' });
    updateNextReminders();
    
    const button = this;
    button.textContent = 'Snoozed!';
    button.disabled = true;
    setTimeout(() => {
      button.textContent = 'Snooze All (30m)';
      button.disabled = false;
    }, 2000);
  });

  // Reset stats
  document.getElementById('resetStats').addEventListener('click', function() {
    if (confirm('Are you sure you want to reset all statistics?')) {
      chrome.storage.sync.set({
        todayBreaks: 0,
        currentStreak: 0,
        lastBreakDate: null
      }, function() {
        document.getElementById('todayBreaks').textContent = '0';
        document.getElementById('currentStreak').textContent = '0';
      });
    }
  });

  // Add time format toggle handler
  document.getElementById('use24Hour').addEventListener('change', function() {
    const use24Hour = this.checked;
    updateTimeDisplays(use24Hour);
    
    // Save the preference
    chrome.storage.sync.set({ use24Hour });
  });

  // Function to format time
  function formatTime(timeStr, use24Hour) {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes), 0);
    
    return date.toLocaleTimeString([], {
      hour: use24Hour ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !use24Hour
    });
  }

  // Function to update all time displays
  function updateTimeDisplays(use24Hour) {
    // Remove the quiet hours display update code and only update next reminders
    updateNextReminders();
  }

  // Update next reminder times
  function updateNextReminders() {
    chrome.storage.sync.get({ use24Hour: true }, function(settings) {
      chrome.alarms.getAll(function(alarms) {
        const timeElements = {
          'Standup': document.getElementById('nextStandup'),
          'Water': document.getElementById('nextWater'),
          'Eye': document.getElementById('nextEye')
        };

        // Reset all displays to '-'
        Object.values(timeElements).forEach(el => {
          if (el) el.textContent = '-';
        });

        // Update times for existing alarms
        alarms.forEach(alarm => {
          const element = timeElements[alarm.name];
          if (element) {
            const nextTime = new Date(alarm.scheduledTime);
            const now = new Date();
            
            const timeOptions = {
              hour: settings.use24Hour ? '2-digit' : 'numeric',
              minute: '2-digit',
              hour12: !settings.use24Hour
            };
            
            if (nextTime.toDateString() === now.toDateString()) {
              element.textContent = nextTime.toLocaleTimeString([], timeOptions);
            } else {
              element.textContent = 'Tomorrow ' + nextTime.toLocaleTimeString([], timeOptions);
            }
          }
        });
      });
    });
  }

  // Update times every second
  updateNextReminders();
  setInterval(updateNextReminders, 1000);

  // Add input validation
  const inputs = document.querySelectorAll('input[type="number"]');
  inputs.forEach(input => {
    input.addEventListener('input', function() {
      const value = parseInt(this.value);
      if (value < 15) {
        this.value = 15;
      } else if (value > 180) {
        this.value = 180;
      }
    });
  });

  // Function to convert 12h to 24h format
  function convertTo24Hour(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours);
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
}); 