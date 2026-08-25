// Speicherschicht: alle Daten liegen lokal in localStorage. Kein Server, kein Sync.
var LFT = window.LFT || {};

(function () {
  "use strict";

  var STORAGE_KEY = "lft_data_v1";

  var MEMBER_COLORS = [
    "#4F9DDE", "#FF8A80", "#81D4AC", "#FFD166",
    "#B48EF0", "#FF9F68", "#5FD3C4", "#F06FA0"
  ];

  function uid() {
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function defaultData() {
    return {
      version: 1,
      members: [],
      tasks: [],
      pinHash: null,
      pinSalt: null
    };
  }

  function clampTimesPerDay(n) {
    var v = parseInt(n, 10);
    if (!v || v < 1) v = 1;
    if (v > 4) v = 4;
    return v;
  }

  function newDoneFlags(n) {
    var flags = [];
    for (var i = 0; i < n; i++) flags.push(false);
    return flags;
  }

  function normalizeMember(m) {
    return {
      id: m.id,
      name: (m.name || "").trim() || "?",
      color: m.color || MEMBER_COLORS[0],
      photo: m.photo || null,
      createdAt: m.createdAt || Date.now()
    };
  }

  // Bringt einen (evtl. aus einer älteren Version stammenden) Task auf die
  // aktuelle Form: timesPerDay/doneFlags statt done/lastDoneDate, order-Feld.
  function normalizeTask(t) {
    var timesPerDay = t.type === "once" ? 1 : clampTimesPerDay(t.timesPerDay);
    var doneFlags = t.doneFlags;
    if (!doneFlags) {
      doneFlags = newDoneFlags(timesPerDay);
      if (t.done) doneFlags[0] = true;
    } else if (doneFlags.length !== timesPerDay) {
      var resized = [];
      for (var i = 0; i < timesPerDay; i++) resized.push(!!doneFlags[i]);
      doneFlags = resized;
    }
    return {
      id: t.id,
      memberId: t.memberId,
      title: t.title,
      icon: t.icon || null,
      type: t.type,
      weekdays: t.weekdays || [],
      timesPerDay: timesPerDay,
      doneFlags: doneFlags,
      lastResetDate: t.lastResetDate || t.lastDoneDate || null,
      order: typeof t.order === "number" ? t.order : null,
      createdAt: t.createdAt || Date.now()
    };
  }

  // Vergibt eine order-Zahl an Tasks, die noch keine haben (z.B. aus einer
  // älteren Version), auf Basis der bisherigen Erstellungsreihenfolge.
  function assignMissingOrder(tasks) {
    var byMember = {};
    tasks.forEach(function (t) {
      if (!byMember[t.memberId]) byMember[t.memberId] = [];
      byMember[t.memberId].push(t);
    });
    Object.keys(byMember).forEach(function (memberId) {
      var list = byMember[memberId];
      var needsAssign = list.some(function (t) { return typeof t.order !== "number"; });
      if (!needsAssign) return;
      // Ein einzelner Sortier-Schlüssel pro Task, statt je nach Paarung
      // unterschiedlich zu vergleichen - sonst ist der Vergleich nicht
      // transitiv und das Ergebnis je nach Engine unterschiedlich, wenn
      // manche Tasks schon eine order haben und andere nicht.
      function sortKey(t) {
        return typeof t.order === "number" ? t.order : 1e15 + (t.createdAt || 0);
      }
      list.sort(function (a, b) { return sortKey(a) - sortKey(b); });
      list.forEach(function (t, idx) { t.order = idx; });
    });
  }

  function loadData() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      return defaultData();
    }
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return defaultData();
      }
      var data = defaultData();
      data.members = parsed.members || [];
      data.tasks = (parsed.tasks || []).map(normalizeTask);
      assignMissingOrder(data.tasks);
      data.pinHash = parsed.pinHash || null;
      data.pinSalt = parsed.pinSalt || null;
      return data;
    } catch (e) {
      return defaultData();
    }
  }

  function saveData(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Speicher voll o.ä. - stillschweigend ignorieren, Daten bleiben im Speicher der Session erhalten
      console.error("Konnte Daten nicht speichern", e);
    }
  }

  var state = loadData();

  function persist() {
    saveData(state);
  }

  // ---------- Members ----------

  function getMembers() {
    return state.members.slice();
  }

  function nextColor() {
    var used = {};
    state.members.forEach(function (m) { used[m.color] = true; });
    for (var i = 0; i < MEMBER_COLORS.length; i++) {
      if (!used[MEMBER_COLORS[i]]) return MEMBER_COLORS[i];
    }
    return MEMBER_COLORS[state.members.length % MEMBER_COLORS.length];
  }

  function addMember(name, color, photo) {
    var member = {
      id: uid(),
      name: name.trim(),
      color: color || nextColor(),
      photo: photo || null,
      createdAt: Date.now()
    };
    state.members.push(member);
    persist();
    return member;
  }

  function updateMember(id, patch) {
    var member = state.members.find(function (m) { return m.id === id; });
    if (!member) return null;
    if (typeof patch.name === "string") member.name = patch.name.trim();
    if (typeof patch.color === "string") member.color = patch.color;
    if (typeof patch.photo !== "undefined") member.photo = patch.photo || null;
    persist();
    return member;
  }

  function deleteMember(id) {
    state.members = state.members.filter(function (m) { return m.id !== id; });
    state.tasks = state.tasks.filter(function (t) { return t.memberId !== id; });
    persist();
  }

  // ---------- Tasks ----------

  function getTasks() {
    return state.tasks.slice();
  }

  function getTasksForMember(memberId) {
    return state.tasks
      .filter(function (t) { return t.memberId === memberId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function nextOrderForMember(memberId) {
    var max = -1;
    state.tasks.forEach(function (t) {
      if (t.memberId === memberId && t.order > max) max = t.order;
    });
    return max + 1;
  }

  function addTask(input) {
    var timesPerDay = input.type === "once" ? 1 : clampTimesPerDay(input.timesPerDay);
    var task = {
      id: uid(),
      memberId: input.memberId,
      title: input.title.trim(),
      icon: input.icon || null,
      type: input.type,
      weekdays: input.type === "weekly" ? (input.weekdays || []) : [],
      timesPerDay: timesPerDay,
      doneFlags: newDoneFlags(timesPerDay),
      lastResetDate: null,
      order: nextOrderForMember(input.memberId),
      createdAt: Date.now()
    };
    state.tasks.push(task);
    persist();
    return task;
  }

  function updateTask(id, patch) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return null;
    if (typeof patch.title === "string") task.title = patch.title.trim();
    if (typeof patch.icon !== "undefined") task.icon = patch.icon || null;
    if (typeof patch.memberId === "string" && patch.memberId !== task.memberId) {
      task.memberId = patch.memberId;
      task.order = nextOrderForMember(patch.memberId);
    }
    if (typeof patch.type === "string") {
      task.type = patch.type;
      task.weekdays = patch.type === "weekly" ? (patch.weekdays || []) : [];
    }
    var effectiveType = patch.type || task.type;
    var newTimesPerDay = effectiveType === "once" ? 1 : clampTimesPerDay(patch.timesPerDay || task.timesPerDay);
    if (newTimesPerDay !== task.timesPerDay) {
      var oldFlags = task.doneFlags || [];
      var flags = [];
      for (var i = 0; i < newTimesPerDay; i++) flags.push(!!oldFlags[i]);
      task.doneFlags = flags;
      task.timesPerDay = newTimesPerDay;
    }
    persist();
    return task;
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    persist();
  }

  function setTaskFlag(id, index, done, todayStr) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return null;
    task.doneFlags[index] = done;
    task.lastResetDate = todayStr;
    persist();
    return task;
  }

  // Verschiebt eine Aufgabe innerhalb der Reihenfolge ihres Familienmitglieds.
  // direction: -1 = nach oben, +1 = nach unten
  function moveTask(id, direction) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    var siblings = getTasksForMember(task.memberId);
    var idx = siblings.findIndex(function (t) { return t.id === id; });
    var newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= siblings.length) return;
    var other = siblings[newIdx];
    var tmp = task.order;
    task.order = other.order;
    other.order = tmp;
    persist();
  }

  function moveTaskUp(id) {
    moveTask(id, -1);
  }

  function moveTaskDown(id) {
    moveTask(id, 1);
  }

  // Übernimmt eine komplette neue Reihenfolge (z.B. nach Drag & Drop auf
  // dem Board). orderedIds = Task-IDs des Mitglieds in der gewünschten
  // Reihenfolge.
  function reorderTasksForMember(memberId, orderedIds) {
    orderedIds.forEach(function (id, idx) {
      var task = state.tasks.find(function (t) { return t.id === id && t.memberId === memberId; });
      if (task) task.order = idx;
    });
    persist();
  }

  function saveTasksBulk() {
    persist();
  }

  // Setzt Haken von wiederkehrenden Aufgaben zurück, wenn ein neuer Tag begonnen hat.
  function runDailyReset() {
    var todayString = LFT.recurrence.todayStr();
    var changed = false;
    state.tasks.forEach(function (task) {
      if (LFT.recurrence.resetIfStale(task, todayString)) changed = true;
    });
    if (changed) persist();
    return changed;
  }

  // ---------- Sicherung (Export/Import) ----------

  function getSummary() {
    return { memberCount: state.members.length, taskCount: state.tasks.length };
  }

  function exportData() {
    return JSON.stringify({
      version: state.version,
      exportedAt: new Date().toISOString(),
      members: state.members,
      tasks: state.tasks,
      pinHash: state.pinHash,
      pinSalt: state.pinSalt
    }, null, 2);
  }

  // Ersetzt ALLE aktuellen Daten durch die im Text enthaltenen (kein
  // Zusammenführen - das wäre bei doppelten Namen/IDs deutlich
  // fehleranfälliger). Wirft einen Error mit verständlicher Meldung, wenn
  // der Text kein gültiges Sicherungsformat ist.
  function importData(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Der eingefügte Text ist kein gültiges Sicherungsformat (kein gültiges JSON).");
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.members) || !Array.isArray(parsed.tasks)) {
      throw new Error("Der eingefügte Text enthält keine gültigen Familien-To-Do-Daten.");
    }

    var newMembers = parsed.members
      .filter(function (m) { return m && typeof m.id === "string" && typeof m.name === "string"; })
      .map(normalizeMember);

    var memberIds = {};
    newMembers.forEach(function (m) { memberIds[m.id] = true; });

    var newTasks = parsed.tasks
      .filter(function (t) { return t && typeof t.id === "string" && typeof t.memberId === "string" && memberIds[t.memberId]; })
      .map(normalizeTask);
    assignMissingOrder(newTasks);

    state.members = newMembers;
    state.tasks = newTasks;
    state.pinHash = typeof parsed.pinHash === "string" ? parsed.pinHash : null;
    state.pinSalt = typeof parsed.pinSalt === "string" ? parsed.pinSalt : null;
    persist();

    return { memberCount: newMembers.length, taskCount: newTasks.length };
  }

  // ---------- PIN ----------

  function hasPin() {
    return !!state.pinHash;
  }

  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    return hex;
  }

  function hashPin(pin, salt) {
    var enc = new TextEncoder();
    var data = enc.encode(salt + ":" + pin);
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle.digest("SHA-256", data).then(bufferToHex);
    }
    // Fallback ohne Web Crypto (sollte auf iOS 12 nicht nötig sein)
    var hash = 0;
    var str = salt + ":" + pin;
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Promise.resolve("fallback" + hash);
  }

  function setPin(pin) {
    var salt = uid();
    return hashPin(pin, salt).then(function (hash) {
      state.pinSalt = salt;
      state.pinHash = hash;
      persist();
      return true;
    });
  }

  function verifyPin(pin) {
    if (!state.pinHash || !state.pinSalt) return Promise.resolve(false);
    return hashPin(pin, state.pinSalt).then(function (hash) {
      return hash === state.pinHash;
    });
  }

  LFT.storage = {
    getMembers: getMembers,
    addMember: addMember,
    updateMember: updateMember,
    deleteMember: deleteMember,
    getTasks: getTasks,
    getTasksForMember: getTasksForMember,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    setTaskFlag: setTaskFlag,
    moveTaskUp: moveTaskUp,
    moveTaskDown: moveTaskDown,
    reorderTasksForMember: reorderTasksForMember,
    saveTasksBulk: saveTasksBulk,
    runDailyReset: runDailyReset,
    getSummary: getSummary,
    exportData: exportData,
    importData: importData,
    hasPin: hasPin,
    setPin: setPin,
    verifyPin: verifyPin,
    MEMBER_COLORS: MEMBER_COLORS
  };

  window.LFT = LFT;
})();
