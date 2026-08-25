// UI-Steuerung: Board rendern, Dialoge, PIN-Sperre.
(function () {
  "use strict";

  var storage = LFT.storage;
  var recurrence = LFT.recurrence;
  var confetti = LFT.confetti;

  var UNLOCK_DURATION_MS = 10 * 60 * 1000;
  var unlockedUntil = 0;

  var WEEKDAY_FULL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  // ---------- Init ----------

  function init() {
    storage.runDailyReset();
    renderToday();
    renderBoard();
    wireHeader();
    registerServiceWorker();

    setInterval(function () {
      renderToday();
      if (storage.runDailyReset()) {
        renderBoard();
      }
    }, 60000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        if (storage.runDailyReset()) {
          renderBoard();
        }
      }
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function (err) {
          console.error("Service Worker Registrierung fehlgeschlagen", err);
        });
      });
    }
  }

  function renderToday() {
    var el = document.getElementById("today-label");
    var now = new Date();
    el.textContent = WEEKDAY_FULL[recurrence.weekdayIndex(now)] + ", " + now.getDate() + ". " + MONTHS[now.getMonth()];
  }

  function wireHeader() {
    document.getElementById("settings-btn").addEventListener("click", function () {
      requireUnlock(openSettingsDialog);
    });
    document.getElementById("onboarding-add-member-btn").addEventListener("click", function () {
      requireUnlock(function () {
        openMemberDialog(null);
      });
    });
  }

  // ---------- Board Rendering ----------

  function renderBoard() {
    var members = storage.getMembers();
    var board = document.getElementById("board");
    var emptyState = document.getElementById("empty-state");

    board.innerHTML = "";

    if (members.length === 0) {
      emptyState.classList.remove("hidden");
      board.classList.add("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    board.classList.remove("hidden");

    members.forEach(function (member) {
      board.appendChild(createColumnEl(member));
    });
  }

  function createColumnEl(member) {
    var tpl = document.getElementById("tpl-column");
    var node = tpl.content.cloneNode(true);
    var section = node.querySelector(".column");
    var avatar = node.querySelector(".column-avatar");
    var name = node.querySelector(".column-name");
    var tasksContainer = node.querySelector(".column-tasks");
    var addBtn = node.querySelector(".add-task-btn");

    avatar.style.background = member.color;
    name.textContent = member.name;

    var today = new Date();
    var allTasks = storage.getTasksForMember(member.id);
    var visibleTasks = allTasks.filter(function (t) {
      return recurrence.isVisibleToday(t, today);
    });

    visibleTasks.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.createdAt - b.createdAt;
    });

    if (visibleTasks.length === 0) {
      var hint = document.createElement("div");
      hint.className = "column-empty-hint";
      hint.textContent = "Noch keine Aufgaben für heute";
      tasksContainer.appendChild(hint);
    } else {
      visibleTasks.forEach(function (task) {
        tasksContainer.appendChild(createTaskCardEl(task));
      });
    }

    addBtn.addEventListener("click", function () {
      requireUnlock(function () {
        openTaskDialog({ mode: "create", memberId: member.id });
      });
    });

    return section;
  }

  function createTaskCardEl(task) {
    var tpl = document.getElementById("tpl-task-card");
    var node = tpl.content.cloneNode(true);
    var card = node.querySelector(".task-card");
    var checkBtn = node.querySelector(".task-check");
    var titleEl = node.querySelector(".task-title");
    var metaEl = node.querySelector(".task-meta");
    var editBtn = node.querySelector(".task-edit-btn");

    if (task.done) card.classList.add("done");
    titleEl.textContent = task.title;
    metaEl.textContent = recurrence.recurrenceLabel(task);

    checkBtn.addEventListener("click", function () {
      toggleTaskDone(task.id, card, checkBtn);
    });

    editBtn.addEventListener("click", function () {
      requireUnlock(function () {
        openTaskDialog({ mode: "edit", task: task });
      });
    });

    return card;
  }

  function toggleTaskDone(taskId, cardEl, checkEl) {
    var tasks = storage.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;

    var newDone = !task.done;
    storage.setTaskDone(taskId, newDone, recurrence.todayStr());

    if (newDone) {
      cardEl.classList.add("done");
      confetti.burst(checkEl);
    } else {
      cardEl.classList.remove("done");
    }

    // Nach kurzer Verzögerung neu sortieren/rendern, damit die Konfetti-Position noch stimmt
    setTimeout(renderBoard, newDone ? 550 : 0);
  }

  // ---------- Dialog Helpers ----------

  function openDialog(bodyEl) {
    var root = document.getElementById("overlay-root");
    var backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    var dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.appendChild(bodyEl);
    backdrop.appendChild(dialog);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });

    root.appendChild(backdrop);
    return { close: close, dialog: dialog };
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- PIN Flow ----------

  function requireUnlock(onUnlocked) {
    if (Date.now() < unlockedUntil) {
      onUnlocked();
      return;
    }
    if (!storage.hasPin()) {
      runPinSetupFlow(function () {
        unlockedUntil = Date.now() + UNLOCK_DURATION_MS;
        onUnlocked();
      });
    } else {
      runPinVerifyFlow(function () {
        unlockedUntil = Date.now() + UNLOCK_DURATION_MS;
        onUnlocked();
      });
    }
  }

  function buildPinPadBody(title, subtitle) {
    var body = el("div");
    body.appendChild(el("h2", null, title));
    body.appendChild(el("p", "dialog-hint", subtitle));

    var display = el("div", "pin-display");
    for (var i = 0; i < 4; i++) display.appendChild(el("span", "pin-dot"));
    body.appendChild(display);

    var error = el("div", "pin-error");
    body.appendChild(error);

    var pad = el("div", "pin-pad");
    var layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
    layout.forEach(function (key) {
      var btn = document.createElement("button");
      if (key === "") {
        btn.style.visibility = "hidden";
      } else if (key === "back") {
        btn.className = "pin-clear";
        btn.textContent = "⌫";
        btn.setAttribute("data-key", "back");
      } else {
        btn.textContent = key;
        btn.setAttribute("data-key", key);
      }
      pad.appendChild(btn);
    });
    body.appendChild(pad);

    var actions = el("div", "dialog-actions");
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Abbrechen";
    actions.appendChild(cancelBtn);
    body.appendChild(actions);

    return { body: body, display: display, error: error, pad: pad, cancelBtn: cancelBtn };
  }

  function updateDots(display, count) {
    var dots = display.querySelectorAll(".pin-dot");
    for (var i = 0; i < dots.length; i++) {
      if (i < count) dots[i].classList.add("filled");
      else dots[i].classList.remove("filled");
    }
  }

  function runPinVerifyFlow(onSuccess) {
    var parts = buildPinPadBody("PIN eingeben", "Bitte gebt eure 4-stellige PIN ein.");
    var dlg = openDialog(parts.body);
    var entered = "";

    parts.cancelBtn.addEventListener("click", dlg.close);

    parts.pad.addEventListener("click", function (e) {
      var key = e.target.getAttribute("data-key");
      if (!key) return;
      parts.error.textContent = "";
      if (key === "back") {
        entered = entered.slice(0, -1);
        updateDots(parts.display, entered.length);
        return;
      }
      if (entered.length >= 4) return;
      entered += key;
      updateDots(parts.display, entered.length);
      if (entered.length === 4) {
        setTimeout(function () {
          storage.verifyPin(entered).then(function (ok) {
            if (ok) {
              dlg.close();
              onSuccess();
            } else {
              parts.error.textContent = "Falsche PIN, versucht es erneut.";
              entered = "";
              updateDots(parts.display, 0);
            }
          });
        }, 120);
      }
    });
  }

  function runPinSetupFlow(onSuccess) {
    var step = "first";
    var firstPin = "";

    var parts = buildPinPadBody("PIN festlegen", "Legt eine 4-stellige PIN fest, damit nur Erwachsene Aufgaben ändern und Einstellungen bearbeiten können.");
    var dlg = openDialog(parts.body);
    var entered = "";

    parts.cancelBtn.addEventListener("click", dlg.close);

    parts.pad.addEventListener("click", function (e) {
      var key = e.target.getAttribute("data-key");
      if (!key) return;
      parts.error.textContent = "";
      if (key === "back") {
        entered = entered.slice(0, -1);
        updateDots(parts.display, entered.length);
        return;
      }
      if (entered.length >= 4) return;
      entered += key;
      updateDots(parts.display, entered.length);
      if (entered.length === 4) {
        setTimeout(function () {
          if (step === "first") {
            firstPin = entered;
            entered = "";
            step = "confirm";
            parts.body.querySelector("h2").textContent = "PIN bestätigen";
            parts.body.querySelector(".dialog-hint").textContent = "Gebt die PIN zur Bestätigung erneut ein.";
            updateDots(parts.display, 0);
          } else {
            if (entered === firstPin) {
              storage.setPin(entered).then(function () {
                dlg.close();
                onSuccess();
              });
            } else {
              parts.error.textContent = "Die PINs stimmen nicht überein. Nochmal von vorn.";
              entered = "";
              firstPin = "";
              step = "first";
              parts.body.querySelector("h2").textContent = "PIN festlegen";
              parts.body.querySelector(".dialog-hint").textContent = "Legt eine 4-stellige PIN fest, damit nur Erwachsene Aufgaben ändern und Einstellungen bearbeiten können.";
              updateDots(parts.display, 0);
            }
          }
        }, 120);
      }
    });
  }

  // ---------- Task Dialog ----------

  function openTaskDialog(opts) {
    var mode = opts.mode;
    var task = opts.task || null;
    var members = storage.getMembers();

    var body = el("div");
    body.appendChild(el("h2", null, mode === "edit" ? "Aufgabe bearbeiten" : "Neue Aufgabe"));

    // Familienmitglied
    var memberField = el("div", "field");
    memberField.appendChild(el("label", null, "Für wen?"));
    var memberSelect = el("div", "member-select");
    var selectedMemberId = task ? task.memberId : (opts.memberId || (members[0] && members[0].id));
    members.forEach(function (m) {
      var chip = el("div", "member-chip");
      chip.setAttribute("data-id", m.id);
      var dot = el("span", "dot");
      dot.style.background = m.color;
      chip.appendChild(dot);
      chip.appendChild(el("span", null, m.name));
      if (m.id === selectedMemberId) chip.classList.add("active");
      chip.addEventListener("click", function () {
        selectedMemberId = m.id;
        memberSelect.querySelectorAll(".member-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
      });
      memberSelect.appendChild(chip);
    });
    memberField.appendChild(memberSelect);
    body.appendChild(memberField);

    // Titel
    var titleField = el("div", "field");
    titleField.appendChild(el("label", null, "Aufgabe"));
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "z. B. Zimmer aufräumen";
    titleInput.value = task ? task.title : "";
    titleInput.maxLength = 60;
    titleField.appendChild(titleInput);
    body.appendChild(titleField);

    // Wiederholung
    var typeField = el("div", "field");
    typeField.appendChild(el("label", null, "Wiederholung"));
    var typeSeg = el("div", "segmented");
    var types = [["once", "Einmalig"], ["daily", "Täglich"], ["weekly", "Wöchentlich"]];
    var selectedType = task ? task.type : "once";
    types.forEach(function (pair) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = pair[1];
      if (pair[0] === selectedType) btn.classList.add("active");
      btn.addEventListener("click", function () {
        selectedType = pair[0];
        typeSeg.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        weekdayField.classList.toggle("hidden", selectedType !== "weekly");
        updateValidity();
      });
      typeSeg.appendChild(btn);
    });
    typeField.appendChild(typeSeg);
    body.appendChild(typeField);

    // Wochentage
    var weekdayField = el("div", "field");
    if (selectedType !== "weekly") weekdayField.classList.add("hidden");
    weekdayField.appendChild(el("label", null, "An welchen Tagen?"));
    var weekdayPicker = el("div", "weekday-picker");
    var selectedWeekdays = task && task.weekdays ? task.weekdays.slice() : [];
    recurrence.WEEKDAY_LABELS.forEach(function (label, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      if (selectedWeekdays.indexOf(idx) !== -1) btn.classList.add("active");
      btn.addEventListener("click", function () {
        var pos = selectedWeekdays.indexOf(idx);
        if (pos === -1) {
          selectedWeekdays.push(idx);
          btn.classList.add("active");
        } else {
          selectedWeekdays.splice(pos, 1);
          btn.classList.remove("active");
        }
        updateValidity();
      });
      weekdayPicker.appendChild(btn);
    });
    weekdayField.appendChild(weekdayPicker);
    body.appendChild(weekdayField);

    // Buttons
    var actions = el("div", "dialog-actions");
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Abbrechen";
    var saveBtn = document.createElement("button");
    saveBtn.className = "primary-btn";
    saveBtn.textContent = "Speichern";
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    body.appendChild(actions);

    if (mode === "edit") {
      var deleteBtn = document.createElement("button");
      deleteBtn.className = "danger-btn";
      deleteBtn.textContent = "Aufgabe löschen";
      deleteBtn.style.marginTop = "10px";
      deleteBtn.style.width = "100%";
      body.appendChild(deleteBtn);
      deleteBtn.addEventListener("click", function () {
        if (window.confirm("Diese Aufgabe wirklich löschen?")) {
          storage.deleteTask(task.id);
          dlg.close();
          renderBoard();
          if (opts.onDone) opts.onDone();
        }
      });
    }

    function updateValidity() {
      var valid = titleInput.value.trim().length > 0 && !!selectedMemberId;
      if (selectedType === "weekly") valid = valid && selectedWeekdays.length > 0;
      saveBtn.disabled = !valid;
    }

    titleInput.addEventListener("input", updateValidity);

    var dlg = openDialog(body);
    updateValidity();

    cancelBtn.addEventListener("click", function () {
      dlg.close();
      if (opts.onDone) opts.onDone();
    });

    saveBtn.addEventListener("click", function () {
      if (saveBtn.disabled) return;
      var payload = {
        memberId: selectedMemberId,
        title: titleInput.value,
        type: selectedType,
        weekdays: selectedWeekdays
      };
      if (mode === "edit") {
        storage.updateTask(task.id, payload);
      } else {
        storage.addTask(payload);
      }
      dlg.close();
      renderBoard();
      if (opts.onDone) opts.onDone();
    });

    if (members.length > 0) {
      setTimeout(function () { titleInput.focus(); }, 50);
    }
  }

  // ---------- Settings Dialog ----------

  function openSettingsDialog() {
    var body = el("div");
    body.appendChild(el("h2", null, "Einstellungen"));

    var memberSection = el("div", "settings-section");
    memberSection.appendChild(el("h3", null, "Familienmitglieder"));
    var list = el("div");
    memberSection.appendChild(list);

    function renderMemberList() {
      list.innerHTML = "";
      storage.getMembers().forEach(function (m) {
        var row = el("div", "member-row");
        var dot = el("span", "dot");
        dot.style.background = m.color;
        row.appendChild(dot);
        row.appendChild(el("span", "name", m.name));

        var editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.addEventListener("click", function () {
          dlg.close();
          openMemberDialog(m, openSettingsDialog);
        });
        row.appendChild(editBtn);

        var delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.addEventListener("click", function () {
          if (window.confirm("Mitglied \"" + m.name + "\" und alle zugehörigen Aufgaben wirklich löschen?")) {
            storage.deleteMember(m.id);
            renderMemberList();
            renderBoard();
          }
        });
        row.appendChild(delBtn);

        list.appendChild(row);
      });
    }
    renderMemberList();

    var addMemberBtn = document.createElement("button");
    addMemberBtn.className = "add-task-btn";
    addMemberBtn.style.width = "100%";
    addMemberBtn.textContent = "+ Mitglied hinzufügen";
    addMemberBtn.addEventListener("click", function () {
      dlg.close();
      openMemberDialog(null, openSettingsDialog);
    });
    memberSection.appendChild(addMemberBtn);
    body.appendChild(memberSection);

    var tasksSection = el("div", "settings-section");
    tasksSection.appendChild(el("h3", null, "Alle Aufgaben"));
    tasksSection.appendChild(el("p", "dialog-hint", "Auch Aufgaben, die heute nicht auf dem Board zu sehen sind."));
    var taskList = el("div");
    tasksSection.appendChild(taskList);

    function renderTaskList() {
      taskList.innerHTML = "";
      var members = storage.getMembers();
      var membersById = {};
      members.forEach(function (m) { membersById[m.id] = m; });
      var tasks = storage.getTasks().slice().sort(function (a, b) { return a.createdAt - b.createdAt; });

      if (tasks.length === 0) {
        taskList.appendChild(el("p", "dialog-hint", "Noch keine Aufgaben angelegt."));
        return;
      }

      tasks.forEach(function (t) {
        var owner = membersById[t.memberId];
        var row = el("div", "member-row");
        var dot = el("span", "dot");
        dot.style.background = owner ? owner.color : "#ccc";
        row.appendChild(dot);
        var label = el("span", "name", t.title + " · " + (owner ? owner.name : "?") + " · " + recurrence.recurrenceLabel(t));
        row.appendChild(label);

        var editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.addEventListener("click", function () {
          dlg.close();
          openTaskDialog({ mode: "edit", task: t, onDone: openSettingsDialog });
        });
        row.appendChild(editBtn);

        var delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.addEventListener("click", function () {
          if (window.confirm("Aufgabe \"" + t.title + "\" wirklich löschen?")) {
            storage.deleteTask(t.id);
            renderTaskList();
            renderBoard();
          }
        });
        row.appendChild(delBtn);

        taskList.appendChild(row);
      });
    }
    renderTaskList();
    body.appendChild(tasksSection);

    var securitySection = el("div", "settings-section");
    securitySection.appendChild(el("h3", null, "Sicherheit"));
    var changePinBtn = document.createElement("button");
    changePinBtn.className = "secondary-btn";
    changePinBtn.style.width = "100%";
    changePinBtn.textContent = "PIN ändern";
    changePinBtn.addEventListener("click", function () {
      dlg.close();
      runPinVerifyFlow(function () {
        runPinSetupFlow(function () {
          openSettingsDialog();
        });
      });
    });
    securitySection.appendChild(changePinBtn);
    body.appendChild(securitySection);

    var closeBtn = document.createElement("button");
    closeBtn.className = "primary-btn";
    closeBtn.style.width = "100%";
    closeBtn.textContent = "Fertig";
    body.appendChild(closeBtn);

    var dlg = openDialog(body);
    closeBtn.addEventListener("click", dlg.close);
  }

  // ---------- Member Dialog ----------

  function openMemberDialog(member, onDone) {
    var isEdit = !!member;
    var body = el("div");
    body.appendChild(el("h2", null, isEdit ? "Mitglied bearbeiten" : "Mitglied hinzufügen"));

    var nameField = el("div", "field");
    nameField.appendChild(el("label", null, "Name"));
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 24;
    nameInput.placeholder = "z. B. Mia";
    nameInput.value = member ? member.name : "";
    nameField.appendChild(nameInput);
    body.appendChild(nameField);

    var colorField = el("div", "field");
    colorField.appendChild(el("label", null, "Farbe"));
    var colorPicker = el("div", "color-picker");
    var selectedColor = member ? member.color : storage.MEMBER_COLORS[0];
    storage.MEMBER_COLORS.forEach(function (c) {
      var swatch = el("span", "color-swatch");
      swatch.style.background = c;
      if (c === selectedColor) swatch.classList.add("active");
      swatch.addEventListener("click", function () {
        selectedColor = c;
        colorPicker.querySelectorAll(".color-swatch").forEach(function (s) { s.classList.remove("active"); });
        swatch.classList.add("active");
      });
      colorPicker.appendChild(swatch);
    });
    colorField.appendChild(colorPicker);
    body.appendChild(colorField);

    var actions = el("div", "dialog-actions");
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "secondary-btn";
    cancelBtn.textContent = "Abbrechen";
    var saveBtn = document.createElement("button");
    saveBtn.className = "primary-btn";
    saveBtn.textContent = "Speichern";
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    body.appendChild(actions);

    function updateValidity() {
      saveBtn.disabled = nameInput.value.trim().length === 0;
    }
    nameInput.addEventListener("input", updateValidity);

    var dlg = openDialog(body);
    updateValidity();

    cancelBtn.addEventListener("click", function () {
      dlg.close();
      if (onDone) onDone();
    });

    saveBtn.addEventListener("click", function () {
      if (saveBtn.disabled) return;
      if (isEdit) {
        storage.updateMember(member.id, { name: nameInput.value, color: selectedColor });
      } else {
        storage.addMember(nameInput.value, selectedColor);
      }
      dlg.close();
      renderBoard();
      if (onDone) onDone();
    });

    setTimeout(function () { nameInput.focus(); }, 50);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
