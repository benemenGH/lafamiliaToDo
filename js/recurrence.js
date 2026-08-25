// Logik für wiederkehrende Aufgaben: sichtbar an welchem Tag, wann der Haken zurückgesetzt wird.
var LFT = window.LFT || {};

(function () {
  "use strict";

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function todayStr(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // 0 = Montag ... 6 = Sonntag
  function weekdayIndex(date) {
    var d = date || new Date();
    return (d.getDay() + 6) % 7;
  }

  var WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function isVisibleToday(task, date) {
    if (task.type === "weekly") {
      return task.weekdays.indexOf(weekdayIndex(date)) !== -1;
    }
    return true;
  }

  // Setzt alle Haken einer wiederkehrenden Aufgabe zurück, wenn seit dem
  // letzten Abhaken ein neuer Tag begonnen hat. Gibt true zurück, wenn sich
  // etwas geändert hat (Aufrufer sollte dann speichern).
  function resetIfStale(task, todayString) {
    if (task.type === "once") return false;
    if (task.lastResetDate === todayString) return false;
    for (var i = 0; i < task.doneFlags.length; i++) task.doneFlags[i] = false;
    task.lastResetDate = todayString;
    return true;
  }

  function applyDailyReset(tasks, todayString) {
    var changed = false;
    tasks.forEach(function (task) {
      if (resetIfStale(task, todayString)) changed = true;
    });
    return changed;
  }

  function isFullyDone(task) {
    return task.doneFlags.length > 0 && task.doneFlags.every(function (f) { return f; });
  }

  function recurrenceLabel(task) {
    var base;
    if (task.type === "once") base = "Einmalig";
    else if (task.type === "daily") base = "Täglich";
    else if (task.type === "weekly") {
      var days = task.weekdays.slice().sort();
      base = days.map(function (i) { return WEEKDAY_LABELS[i]; }).join(", ");
    } else {
      base = "";
    }
    if (task.timesPerDay > 1) base += " · " + task.timesPerDay + "×";
    return base;
  }

  LFT.recurrence = {
    todayStr: todayStr,
    weekdayIndex: weekdayIndex,
    WEEKDAY_LABELS: WEEKDAY_LABELS,
    isVisibleToday: isVisibleToday,
    resetIfStale: resetIfStale,
    applyDailyReset: applyDailyReset,
    isFullyDone: isFullyDone,
    recurrenceLabel: recurrenceLabel
  };

  window.LFT = LFT;
})();
