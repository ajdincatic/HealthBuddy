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
      use24Hour: true,
      isSnoozeActive: false,
      snoozeEndTime: null
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
      updateSnoozeState(items.isSnoozeActive, items.snoozeEndTime);

      // Add after the initial settings load
      document.querySelectorAll('#standupEnabled, #waterEnabled, #eyeEnabled').forEach(toggle => {
        toggle.addEventListener('change', function() {
          const type = this.id.replace('Enabled', '');
          const isEnabled = this.checked;
          
          // Save the enabled state
          chrome.storage.sync.set({
            [`${type.toLowerCase()}Enabled`]: isEnabled
          });
          
          if (!isEnabled) {
            // Reset progress bar when disabled
            const progressBar = document.getElementById(`${type.toLowerCase()}Bar`);
            if (progressBar) {
              progressBar.style.width = '0%';
              progressBar.style.transition = 'none'; // Disable animation
            }
            
            // Reset time display
            const timeElement = document.getElementById(`next${type}`);
            if (timeElement) {
              timeElement.textContent = '-';
            }

            // Remove the alarm
            chrome.alarms.clear(type);
          } else {
            // Re-enable progress bar animation
            const progressBar = document.getElementById(`${type.toLowerCase()}Bar`);
            if (progressBar) {
              progressBar.style.transition = 'width 1s linear';
            }
            
            // Re-create alarm when enabled
            chrome.storage.sync.get(
              { [`${type.toLowerCase()}Interval`]: 30 },
              function(settings) {
                chrome.alarms.create(type, { 
                  periodInMinutes: settings[`${type.toLowerCase()}Interval`] 
                });
                updateNextReminders();
              }
            );
          }
        });
      });
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
    const newSettings = {
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

    // Get current settings to check what changed
    chrome.storage.sync.get(newSettings, function(oldSettings) {
      const changedIntervals = ['standupInterval', 'waterInterval', 'eyeInterval']
        .filter(key => oldSettings[key] !== newSettings[key]);
      
      const needAlarmsUpdate = changedIntervals.length > 0;

      chrome.storage.sync.set(newSettings, function() {
        if (needAlarmsUpdate) {
          chrome.runtime.sendMessage({ 
            action: 'updateAlarms', 
            settings: newSettings,
            changedIntervals: changedIntervals
          });
        }
        
        // Show success message
        const button = document.getElementById('saveSettings');
        const originalText = button.textContent;
        button.textContent = 'Saved!';
        button.disabled = true;
        
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);

        // Only update displays if needed
        if (oldSettings.use24Hour !== newSettings.use24Hour) {
          updateTimeDisplays(newSettings.use24Hour);
        } else if (oldSettings.quietStart !== newSettings.quietStart || 
                   oldSettings.quietEnd !== newSettings.quietEnd) {
          updateNextReminders();
        }
      });
    });
  });

  // Snooze all reminders
  document.getElementById('snoozeAll').addEventListener('click', function() {
    const snoozeEndTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    
    chrome.storage.sync.set({ 
      isSnoozeActive: true, 
      snoozeEndTime: snoozeEndTime.toISOString() 
    });
    
    chrome.runtime.sendMessage({ action: 'snoozeAll' });
    updateNextReminders();
    updateSnoozeState(true, snoozeEndTime);
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
    chrome.storage.sync.get({
      use24Hour: true,
      quietStart: '22:00',
      quietEnd: '09:00',
      standupEnabled: true,
      waterEnabled: true,
      eyeEnabled: true
    }, function(settings) {
      chrome.alarms.getAll(function(alarms) {
        const timeElements = {
          'Standup': document.getElementById('nextStandup'),
          'Water': document.getElementById('nextWater'),
          'Eye': document.getElementById('nextEye')
        };

        const progressBars = {
          'Standup': document.getElementById('standupBar'),
          'Water': document.getElementById('waterBar'),
          'Eye': document.getElementById('eyeBar')
        };

        // Reset all displays to '-' and progress bars to 0
        Object.entries(timeElements).forEach(([type, element]) => {
          if (element) {
            element.textContent = '-';
            const isEnabled = settings[`${type.toLowerCase()}Enabled`];
            const progressBar = progressBars[type];
            
            if (!isEnabled && progressBar) {
              progressBar.style.transition = 'none';
              progressBar.style.width = '0%';
            } else if (progressBar) {
              progressBar.style.transition = 'width 1s linear';
            }
          }
        });

        // Update only enabled alarms
        alarms.forEach(alarm => {
          const element = timeElements[alarm.name];
          const progressBar = progressBars[alarm.name];
          const isEnabled = settings[`${alarm.name.toLowerCase()}Enabled`];
          
          if (element && progressBar && isEnabled) {
            let nextTime = new Date(alarm.scheduledTime);
            const now = new Date();

            // Calculate progress percentage
            const interval = alarm.periodInMinutes * 60 * 1000;
            const timeLeft = nextTime - now;
            const progress = 100 - ((timeLeft / interval) * 100);
            
            // Update progress bar
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;

            // Check if next alarm time falls in quiet hours
            const [startHours, startMinutes] = settings.quietStart.split(':');
            const [endHours, endMinutes] = settings.quietEnd.split(':');
            
            const quietStart = new Date(nextTime);
            quietStart.setHours(parseInt(startHours), parseInt(startMinutes), 0);
            
            const quietEnd = new Date(nextTime);
            quietEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0);

            // Adjust if quiet hours span midnight
            if (quietEnd < quietStart) {
              if (nextTime.getHours() < parseInt(endHours) || 
                  (nextTime.getHours() === parseInt(endHours) && 
                   nextTime.getMinutes() < parseInt(endMinutes))) {
                quietStart.setDate(quietStart.getDate() - 1);
              } else {
                quietEnd.setDate(quietEnd.getDate() + 1);
              }
            }

            // If alarm falls in quiet hours, adjust to end of quiet hours
            if (nextTime >= quietStart && nextTime <= quietEnd) {
              nextTime = new Date(quietEnd);
              // Add the interval to the end of quiet hours
              nextTime.setMinutes(nextTime.getMinutes() + alarm.periodInMinutes);
            }

            const timeOptions = {
              hour: settings.use24Hour ? '2-digit' : 'numeric',
              minute: '2-digit',
              hour12: !settings.use24Hour
            };
            
            if (nextTime.toDateString() === now.toDateString()) {
              element.textContent = nextTime.toLocaleTimeString([], timeOptions);
              if (nextTime > alarm.scheduledTime) {
                element.textContent += ' (after quiet hours)';
              }
            } else {
              element.textContent = 'Tomorrow ' + nextTime.toLocaleTimeString([], timeOptions);
              if (nextTime > alarm.scheduledTime) {
                element.textContent += ' (after quiet hours)';
              }
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
      if (value <= 0) {
        this.value = 1;
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

  // Add snooze state handling
  function updateSnoozeState(isActive, endTime) {
    const snoozeBtn = document.getElementById('snoozeAll');
    const cancelBtn = document.getElementById('cancelSnooze');

    if (isActive && endTime) {
      const now = new Date();
      const snoozeEnd = new Date(endTime);
      
      if (now < snoozeEnd) {
        snoozeBtn.style.display = 'none';
        cancelBtn.style.display = 'block';
        
        // Update button text with remaining time
        const remainingMinutes = Math.ceil((snoozeEnd - now) / (1000 * 60));
        cancelBtn.textContent = `Cancel Snooze (${remainingMinutes}m left)`;
      } else {
        // Snooze has expired
        chrome.storage.sync.set({ isSnoozeActive: false, snoozeEndTime: null });
        snoozeBtn.style.display = 'block';
        cancelBtn.style.display = 'none';
      }
    } else {
      snoozeBtn.style.display = 'block';
      cancelBtn.style.display = 'none';
    }
  }

  // Add cancel snooze handler
  document.getElementById('cancelSnooze').addEventListener('click', function() {
    chrome.storage.sync.set({ 
      isSnoozeActive: false, 
      snoozeEndTime: null 
    });
    
    // Reset all alarms to their original intervals
    chrome.runtime.sendMessage({ action: 'cancelSnooze' });
    updateNextReminders();
    updateSnoozeState(false, null);
  });

  // Update snooze state periodically
  setInterval(() => {
    chrome.storage.sync.get(['isSnoozeActive', 'snoozeEndTime'], function(items) {
      updateSnoozeState(items.isSnoozeActive, items.snoozeEndTime);
    });
  }, 1000);
}); 