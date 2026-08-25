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

  // Setzt den Haken zurück, wenn die Aufgabe wiederkehrend ist und seit dem
  // letzten Abhaken ein neuer Tag begonnen hat. Gibt true zurück, wenn sich
  // etwas geändert hat (Aufrufer sollte dann speichern).
  function resetIfStale(task, todayString) {
    if (task.type === "once") return false;
    if (task.done && task.lastDoneDate !== todayString) {
      task.done = false;
      return true;
    }
    return false;
  }

  function applyDailyReset(tasks, todayString) {
    var changed = false;
    tasks.forEach(function (task) {
      if (resetIfStale(task, todayString)) changed = true;
    });
    return changed;
  }

  function recurrenceLabel(task) {
    if (task.type === "once") return "Einmalig";
    if (task.type === "daily") return "Täglich";
    if (task.type === "weekly") {
      var days = task.weekdays.slice().sort();
      return days.map(function (i) { return WEEKDAY_LABELS[i]; }).join(", ");
    }
    return "";
  }

  LFT.recurrence = {
    todayStr: todayStr,
    weekdayIndex: weekdayIndex,
    WEEKDAY_LABELS: WEEKDAY_LABELS,
    isVisibleToday: isVisibleToday,
    resetIfStale: resetIfStale,
    applyDailyReset: applyDailyReset,
    recurrenceLabel: recurrenceLabel
  };

  window.LFT = LFT;
})();
