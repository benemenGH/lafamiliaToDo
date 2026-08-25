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
      data.tasks = parsed.tasks || [];
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

  function addMember(name, color) {
    var member = {
      id: uid(),
      name: name.trim(),
      color: color || nextColor(),
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
    return state.tasks.filter(function (t) { return t.memberId === memberId; });
  }

  function addTask(input) {
    var task = {
      id: uid(),
      memberId: input.memberId,
      title: input.title.trim(),
      icon: input.icon || null,
      type: input.type,
      weekdays: input.type === "weekly" ? (input.weekdays || []) : [],
      done: false,
      lastDoneDate: null,
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
    if (typeof patch.memberId === "string") task.memberId = patch.memberId;
    if (typeof patch.type === "string") {
      task.type = patch.type;
      task.weekdays = patch.type === "weekly" ? (patch.weekdays || []) : [];
    }
    persist();
    return task;
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    persist();
  }

  function setTaskDone(id, done, todayStr) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return null;
    task.done = done;
    task.lastDoneDate = done ? todayStr : task.lastDoneDate;
    persist();
    return task;
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
    setTaskDone: setTaskDone,
    saveTasksBulk: saveTasksBulk,
    runDailyReset: runDailyReset,
    hasPin: hasPin,
    setPin: setPin,
    verifyPin: verifyPin,
    MEMBER_COLORS: MEMBER_COLORS
  };

  window.LFT = LFT;
})();
