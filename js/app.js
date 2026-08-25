// UI-Steuerung: Board rendern, Dialoge, PIN-Sperre.
(function () {
  "use strict";

  var storage = LFT.storage;
  var recurrence = LFT.recurrence;
  var confetti = LFT.confetti;

  var UNLOCK_DURATION_MS = 10 * 60 * 1000;
  var unlockedUntil = 0;

  var TASK_ICONS = [
    "🦷", "🛏️", "🧸", "📚", "🎒", "🍽️", "🧹", "🧺",
    "🐶", "🐔", "🚿", "👕", "🚮", "🥤", "🌱", "🎨",
    "⚽", "📖", "🚲", "🛁", "⭐"
  ];

  // ---------- Init ----------

  function init() {
    storage.runDailyReset();
    renderBoard();
    wireButtons();
    registerServiceWorker();
    keepScreenAwake();

    setInterval(function () {
      if (storage.runDailyReset()) {
        renderBoard();
      }
    }, 60000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        if (storage.runDailyReset()) {
          renderBoard();
        }
        keepScreenAwake();
      }
    });
  }

  // Verhindert, dass der Bildschirm einschläft, sofern der Browser die
  // Wake-Lock-API unterstützt (auf einem iPad mit iOS 12 z.B. noch nicht -
  // dort hilft nur "Automatische Sperre: Nie" in den iPad-Einstellungen).
  function keepScreenAwake() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").catch(function () {
      // z.B. Akku im Sparmodus - dann bleibt es bei der Systemeinstellung
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function (err) {
          console.error("Service Worker Registrierung fehlgeschlagen", err);
        });
      });

      // Sobald eine neue Version des Service Workers die bisherige ablöst,
      // Seite einmal neu laden, damit Updates ohne manuelles Doppel-Reload
      // ankommen. Wichtig: beim allerersten Aufruf (noch kein Controller
      // vorhanden) NICHT neu laden - sonst lädt die App bei jedem einzigen
      // Start ungefragt neu und reißt z.B. eine gerade laufende PIN-Eingabe ab.
      var hadControllerAtLoad = !!navigator.serviceWorker.controller;
      var reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hadControllerAtLoad) {
          hadControllerAtLoad = true;
          return;
        }
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
    }
  }

  function wireButtons() {
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

  // Während eine Karte aktiv gezogen wird, darf renderBoard() nicht
  // dazwischenfunken (es würde den Original-Container der gezogenen Karte
  // zerstören). Externe Aufrufe (Checkbox-Timeout, 60s-Intervall,
  // visibilitychange) werden stattdessen vorgemerkt und laufen automatisch
  // nach, sobald der Drag beendet ist.
  var boardDragActive = false;
  var boardRenderPending = false;

  function renderBoard() {
    if (boardDragActive) {
      boardRenderPending = true;
      return;
    }
    boardRenderPending = false;

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
      var aDone = recurrence.isFullyDone(a);
      var bDone = recurrence.isFullyDone(b);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.order || 0) - (b.order || 0);
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
    var checkSlot = node.querySelector(".task-check-slot");
    var iconEl = node.querySelector(".task-icon");
    var titleEl = node.querySelector(".task-title");
    var metaEl = node.querySelector(".task-meta");
    var editBtn = node.querySelector(".task-edit-btn");
    var dragHandle = node.querySelector(".task-drag-handle");

    card.setAttribute("data-task-id", task.id);

    if (recurrence.isFullyDone(task)) card.classList.add("done");
    if (task.icon) {
      iconEl.textContent = task.icon;
      iconEl.classList.remove("hidden");
    }
    titleEl.textContent = task.title;
    metaEl.textContent = recurrence.recurrenceLabel(task);

    buildCheckControls(checkSlot, task, card);

    editBtn.addEventListener("click", function () {
      requireUnlock(function () {
        openTaskDialog({ mode: "edit", task: task });
      });
    });

    wireDragHandle(dragHandle, task, card);

    return card;
  }

  // ---------- Drag & Drop (Touch, kein HTML5-DnD - das funktioniert auf
  // iOS Safari nicht per Touch) ----------

  function getEventY(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
    return e.clientY;
  }

  function wireDragHandle(handle, task, cardEl) {
    var drag = null;

    function onStart(e) {
      // Verschieben ist wie Bearbeiten/Löschen PIN-geschützt.
      if (Date.now() >= unlockedUntil) {
        requireUnlock(function () {}); // beim nächsten Versuch klappt der Zug dann
        return;
      }
      if (e.touches && e.touches.length > 1) return;

      var rect = cardEl.getBoundingClientRect();
      var placeholder = document.createElement("div");
      placeholder.className = "task-drop-placeholder";
      placeholder.style.height = rect.height + "px";

      drag = {
        startY: getEventY(e),
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        container: cardEl.parentNode,
        placeholder: placeholder,
        engaged: false
      };

      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
    }

    function engage() {
      boardDragActive = true;
      drag.container.insertBefore(drag.placeholder, cardEl);
      cardEl.classList.add("dragging");
      cardEl.style.position = "fixed";
      cardEl.style.left = drag.left + "px";
      cardEl.style.top = drag.top + "px";
      cardEl.style.width = drag.width + "px";
      cardEl.style.zIndex = "60";
      document.body.appendChild(cardEl);
      drag.engaged = true;
    }

    function onMove(e) {
      if (!drag) return;
      // Sofort verhindern, dass diese Bewegung stattdessen die Spalte
      // scrollt - touch-action:none (CSS) hilft dabei auf iOS 12 nicht,
      // da Safari das erst ab Version 13 unterstützt. Muss deshalb schon
      // VOR der Bewegungs-Schwelle laufen, sonst kann die native
      // Scroll-Geste den Zug kapern, bevor wir überhaupt "engagen".
      if (e.cancelable) e.preventDefault();

      var y = getEventY(e);
      var deltaY = y - drag.startY;

      if (!drag.engaged) {
        if (Math.abs(deltaY) < 6) return;
        engage();
      }

      cardEl.style.top = (drag.top + deltaY) + "px";

      var siblings = Array.prototype.slice.call(
        drag.container.querySelectorAll(".task-card")
      );
      var cardCenter = drag.top + deltaY + drag.height / 2;
      var target = null;
      for (var i = 0; i < siblings.length; i++) {
        var sRect = siblings[i].getBoundingClientRect();
        if (cardCenter < sRect.top + sRect.height / 2) {
          target = siblings[i];
          break;
        }
      }
      if (target) {
        drag.container.insertBefore(drag.placeholder, target);
      } else {
        drag.container.appendChild(drag.placeholder);
      }
    }

    function onEnd() {
      if (!drag) return;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);

      if (drag.engaged) {
        var container = drag.container;
        container.insertBefore(cardEl, drag.placeholder);
        container.removeChild(drag.placeholder);
        cardEl.classList.remove("dragging");
        cardEl.style.position = "";
        cardEl.style.left = "";
        cardEl.style.top = "";
        cardEl.style.width = "";
        cardEl.style.zIndex = "";

        var visibleIds = Array.prototype.slice.call(
          container.querySelectorAll(".task-card")
        ).map(function (el) { return el.getAttribute("data-task-id"); });

        // Nur die heute sichtbaren Aufgaben werden gezogen/neu sortiert.
        // Mit den evtl. heute nicht sichtbaren Aufgaben desselben
        // Mitglieds zusammenführen, statt deren Reihenfolge einfach zu
        // überschreiben (sonst können zwei Aufgaben dieselbe order-Zahl
        // bekommen).
        var fullOrder = storage.getTasksForMember(task.memberId).map(function (t) { return t.id; });
        var visibleSet = {};
        visibleIds.forEach(function (id) { visibleSet[id] = true; });
        var hiddenIds = fullOrder.filter(function (id) { return !visibleSet[id]; });
        var insertAt = 0;
        for (var i = 0; i < fullOrder.length; i++) {
          if (visibleSet[fullOrder[i]]) break;
          insertAt++;
        }
        var mergedOrder = hiddenIds.slice(0, insertAt)
          .concat(visibleIds)
          .concat(hiddenIds.slice(insertAt));

        storage.reorderTasksForMember(task.memberId, mergedOrder);
      }

      var needsRender = drag.engaged || boardRenderPending;
      boardDragActive = false;
      drag = null;
      if (needsRender) renderBoard();
    }

    handle.addEventListener("touchstart", onStart, { passive: true });
    handle.addEventListener("mousedown", onStart);
  }

  // Baut je nach timesPerDay entweder einen großen Haken-Button (1x) oder
  // mehrere kleine Kreise (mehrmals täglich, z.B. Zähneputzen morgens/abends).
  function buildCheckControls(container, task, card) {
    var n = task.timesPerDay || 1;

    if (n <= 1) {
      var btn = document.createElement("button");
      btn.className = "task-check";
      btn.setAttribute("aria-label", "Aufgabe abhaken");
      var icon = document.createElement("span");
      icon.className = "task-check-icon";
      icon.textContent = "✓";
      btn.appendChild(icon);
      if (task.doneFlags[0]) btn.classList.add("done");
      btn.addEventListener("click", function () {
        toggleTaskFlag(task.id, 0, card, btn);
      });
      container.appendChild(btn);
      return;
    }

    var group = document.createElement("div");
    group.className = "task-check-multi";
    for (var i = 0; i < n; i++) {
      (function (index) {
        var mini = document.createElement("button");
        mini.className = "task-check-mini";
        mini.setAttribute("aria-label", "Aufgabe abhaken (" + (index + 1) + "/" + n + ")");
        var mIcon = document.createElement("span");
        mIcon.className = "task-check-icon";
        mIcon.textContent = "✓";
        mini.appendChild(mIcon);
        if (task.doneFlags[index]) mini.classList.add("done");
        mini.addEventListener("click", function () {
          toggleTaskFlag(task.id, index, card, mini);
        });
        group.appendChild(mini);
      })(i);
    }
    container.appendChild(group);
  }

  function toggleTaskFlag(taskId, index, cardEl, btnEl) {
    var tasks = storage.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;

    var newValue = !task.doneFlags[index];
    storage.setTaskFlag(taskId, index, newValue, recurrence.todayStr());

    if (newValue) {
      btnEl.classList.add("done");
      confetti.burst(btnEl);
    } else {
      btnEl.classList.remove("done");
    }

    // Nach kurzer Verzögerung neu sortieren/rendern, damit die Konfetti-Position noch stimmt
    setTimeout(renderBoard, newValue ? 550 : 0);
  }

  // ---------- Dialog Helpers ----------

  function openDialog(bodyEl, onClose) {
    var root = document.getElementById("overlay-root");
    // Es darf nie mehr als ein Dialog gleichzeitig offen sein - sonst können
    // sich Overlays stapeln und Taps landen auf dem falschen Fenster.
    while (root.firstChild) root.removeChild(root.firstChild);

    var backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    var dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.appendChild(bodyEl);
    backdrop.appendChild(dialog);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      // Läuft IMMER, egal ob über einen Button oder per Tap auf den
      // abgedunkelten Hintergrund geschlossen wurde - sonst bleiben z.B.
      // PIN-Dialoge, die per Backdrop-Tap weggewischt wurden, "offen"
      // hängen (requireUnlock würde nie wieder reagieren).
      if (onClose) onClose();
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

  var pinFlowActive = false;

  function requireUnlock(onUnlocked) {
    if (Date.now() < unlockedUntil) {
      onUnlocked();
      return;
    }
    // Verhindert, dass ein doppelter Tap (z.B. auf "+ Aufgabe") zwei
    // PIN-Dialoge gleichzeitig anstößt.
    if (pinFlowActive) return;
    pinFlowActive = true;

    function unlockAndContinue() {
      pinFlowActive = false;
      unlockedUntil = Date.now() + UNLOCK_DURATION_MS;
      onUnlocked();
    }

    if (!storage.hasPin()) {
      runPinSetupFlow(unlockAndContinue, function () { pinFlowActive = false; });
    } else {
      runPinVerifyFlow(unlockAndContinue, function () { pinFlowActive = false; });
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

  function runPinVerifyFlow(onSuccess, onCancel) {
    var parts = buildPinPadBody("PIN eingeben", "Bitte gebt eure 4-stellige PIN ein.");
    // onCancel läuft über openDialogs onClose, damit es auch greift, wenn
    // der Dialog per Tap auf den abgedunkelten Hintergrund geschlossen wird
    // (nicht nur über den Abbrechen-Button) - sonst bleibt requireUnlock
    // dauerhaft "gesperrt" hängen.
    var dlg = openDialog(parts.body, onCancel);
    var entered = "";
    var locked = false; // sperrt die Tastatur während der Prüfung gegen Doppel-Taps

    parts.cancelBtn.addEventListener("click", function () {
      dlg.close();
    });

    parts.pad.addEventListener("click", function (e) {
      if (locked) return;
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
        locked = true;
        setTimeout(function () {
          storage.verifyPin(entered).then(function (ok) {
            if (ok) {
              dlg.close();
              onSuccess();
            } else {
              parts.error.textContent = "Falsche PIN, versucht es erneut.";
              entered = "";
              updateDots(parts.display, 0);
              locked = false;
            }
          });
        }, 120);
      }
    });
  }

  function runPinSetupFlow(onSuccess, onCancel) {
    var step = "first";
    var firstPin = "";

    var parts = buildPinPadBody("PIN festlegen", "Legt eine 4-stellige PIN fest, damit nur Erwachsene Aufgaben ändern und Einstellungen bearbeiten können.");
    var dlg = openDialog(parts.body, onCancel);
    var entered = "";
    var locked = false;

    parts.cancelBtn.addEventListener("click", function () {
      dlg.close();
    });

    parts.pad.addEventListener("click", function (e) {
      if (locked) return;
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
        locked = true;
        setTimeout(function () {
          if (step === "first") {
            firstPin = entered;
            entered = "";
            step = "confirm";
            parts.body.querySelector("h2").textContent = "PIN bestätigen";
            parts.body.querySelector(".dialog-hint").textContent = "Gebt die PIN zur Bestätigung erneut ein.";
            updateDots(parts.display, 0);
            locked = false;
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
              locked = false;
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

    // Symbol (hilft Kindern, die noch nicht/schlecht lesen können)
    var iconField = el("div", "field");
    iconField.appendChild(el("label", null, "Symbol"));
    var iconPicker = el("div", "icon-picker");
    var selectedIcon = task ? (task.icon || "") : "";
    var noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.textContent = "–";
    if (!selectedIcon) noneBtn.classList.add("active");
    noneBtn.addEventListener("click", function () {
      selectedIcon = "";
      iconPicker.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
      noneBtn.classList.add("active");
    });
    iconPicker.appendChild(noneBtn);
    TASK_ICONS.forEach(function (icon) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = icon;
      if (icon === selectedIcon) btn.classList.add("active");
      btn.addEventListener("click", function () {
        selectedIcon = icon;
        iconPicker.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
      iconPicker.appendChild(btn);
    });
    iconField.appendChild(iconPicker);
    body.appendChild(iconField);

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
        freqField.classList.toggle("hidden", selectedType === "once");
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

    // Häufigkeit pro Tag (z.B. Zähneputzen morgens UND abends)
    var freqField = el("div", "field");
    if (selectedType === "once") freqField.classList.add("hidden");
    freqField.appendChild(el("label", null, "Wie oft am Tag?"));
    var freqSeg = el("div", "segmented");
    var selectedTimesPerDay = task ? (task.timesPerDay || 1) : 1;
    [1, 2, 3, 4].forEach(function (n) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = n + "×";
      if (n === selectedTimesPerDay) btn.classList.add("active");
      btn.addEventListener("click", function () {
        selectedTimesPerDay = n;
        freqSeg.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
      freqSeg.appendChild(btn);
    });
    freqField.appendChild(freqSeg);
    body.appendChild(freqField);

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
      var reorderRow = el("div", "dialog-actions");
      reorderRow.style.marginTop = "10px";
      var upBtn = document.createElement("button");
      upBtn.className = "secondary-btn";
      upBtn.textContent = "⬆ Nach oben";
      var downBtn = document.createElement("button");
      downBtn.className = "secondary-btn";
      downBtn.textContent = "⬇ Nach unten";
      reorderRow.appendChild(upBtn);
      reorderRow.appendChild(downBtn);
      body.appendChild(reorderRow);

      upBtn.addEventListener("click", function () {
        storage.moveTaskUp(task.id);
        renderBoard();
      });
      downBtn.addEventListener("click", function () {
        storage.moveTaskDown(task.id);
        renderBoard();
      });

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
        icon: selectedIcon,
        type: selectedType,
        weekdays: selectedWeekdays,
        timesPerDay: selectedTimesPerDay
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

      if (members.length === 0) {
        taskList.appendChild(el("p", "dialog-hint", "Noch keine Familienmitglieder angelegt."));
        return;
      }

      members.forEach(function (member) {
        var heading = el("div", "task-list-member-heading");
        var dot = el("span", "dot");
        dot.style.background = member.color;
        heading.appendChild(dot);
        heading.appendChild(el("span", null, member.name));
        taskList.appendChild(heading);

        var memberTasks = storage.getTasksForMember(member.id);

        if (memberTasks.length === 0) {
          taskList.appendChild(el("p", "dialog-hint", "Noch keine Aufgaben."));
          return;
        }

        memberTasks.forEach(function (t) {
          var row = el("div", "member-row");
          var rowDot = el("span", "dot");
          rowDot.style.background = member.color;
          row.appendChild(rowDot);
          var label = el("span", "name", (t.icon ? t.icon + " " : "") + t.title + " · " + recurrence.recurrenceLabel(t));
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
