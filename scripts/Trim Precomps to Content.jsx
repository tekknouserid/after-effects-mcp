/*
  Trim Precomps to Content
  ------------------------
  For the selected precomp layers in the active comp (or every precomp layer
  in it if nothing is selected):
    - finds where the visible content inside the precomp starts and ends,
    - shifts that content to start at 0 and trims the precomp's duration to fit,
    - moves every instance of the precomp (in any comp) so the content plays
      at exactly the same time as before, keeping existing trims.
  Skips precomps with time remapping or reversed/zero stretch on any instance.
  One undo step: Edit > Undo "Trim Precomps to Content".
*/
(function () {

  function frameRound(t, fd) { return Math.round(t / fd) * fd; }

  function contentRange(c) {
    var s = Infinity, e = -Infinity;
    for (var i = 1; i <= c.numLayers; i++) {
      var l = c.layer(i);
      if (l.guideLayer) continue;
      var shows = (l.hasVideo && l.enabled) || (l.hasAudio && l.audioEnabled);
      if (!shows) continue;
      if (l.inPoint < s) s = l.inPoint;
      if (l.outPoint > e) e = l.outPoint;
    }
    if (s === Infinity) return null;
    s = Math.max(0, s);
    e = Math.min(c.duration, e);
    if (e - s < c.frameDuration / 2) return null;
    return [frameRound(s, c.frameDuration), frameRound(e, c.frameDuration)];
  }

  function instancesOf(c) {
    var res = [], used = c.usedIn;
    for (var i = 0; i < used.length; i++) {
      var p = used[i];
      for (var j = 1; j <= p.numLayers; j++) {
        if (p.layer(j).source === c) res.push(p.layer(j));
      }
    }
    return res;
  }

  function setInOut(L, a, b) {
    if (a < L.outPoint) { L.inPoint = a; L.outPoint = b; }
    else { L.outPoint = b; L.inPoint = a; }
  }

  function trimComp(c, report) {
    var r = contentRange(c);
    if (!r) { report.push(c.name + ": no visible content, skipped"); return; }
    var s = r[0], e = r[1], newDur = e - s, fd = c.frameDuration;
    if (s < fd / 2 && Math.abs(e - c.duration) < fd / 2) { report.push(c.name + ": already fits its content"); return; }

    var inst = instancesOf(c), k;
    for (k = 0; k < inst.length; k++) {
      var L0 = inst[k];
      if (L0.timeRemapEnabled) { report.push(c.name + ": skipped, time remapping is on in '" + L0.containingComp.name + "'"); return; }
      if (L0.stretch <= 0) { report.push(c.name + ": skipped, reversed or zero stretch in '" + L0.containingComp.name + "'"); return; }
    }

    var saved = [];
    for (k = 0; k < inst.length; k++) saved.push({ L: inst[k], locked: inst[k].locked, inP: inst[k].inPoint, outP: inst[k].outPoint });

    // shift the precomp's own layers and markers so the content starts at 0
    if (s > 0) {
      for (var i = 1; i <= c.numLayers; i++) {
        var l = c.layer(i), lk = l.locked;
        if (lk) l.locked = false;
        l.startTime -= s;
        if (lk) l.locked = true;
      }
      var mp = c.markerProperty, marks = [];
      for (var m = mp.numKeys; m >= 1; m--) { marks.push([mp.keyTime(m), mp.keyValue(m)]); mp.removeKey(m); }
      for (var n = 0; n < marks.length; n++) { var t = marks[n][0] - s; if (t >= 0 && t <= newDur) mp.setValueAtTime(t, marks[n][1]); }
    }
    c.duration = newDur;

    // move every instance so the content plays at the same moment, keeping trims
    for (k = 0; k < saved.length; k++) {
      var sv = saved[k], L = sv.L, st = L.stretch / 100;
      L.locked = false;
      L.startTime = L.startTime + s * st;
      var a = L.startTime, b = L.startTime + newDur * st;
      var inP = Math.max(sv.inP, a), outP = Math.min(sv.outP, b);
      if (outP - inP < fd / 2) { inP = a; outP = b; }
      setInOut(L, inP, outP);
      if (sv.locked) L.locked = true;
    }
    // reset the work area to the whole (new) duration; cosmetic, so never fatal
    try { c.workAreaStart = 0; } catch (e1) {}
    try { c.workAreaDuration = c.duration - c.workAreaStart; }
    catch (e2) { try { c.workAreaDuration = c.duration - c.workAreaStart - fd / 100; } catch (e3) {} }
    report.push(c.name + ": trimmed to " + newDur.toFixed(2) + "s (content was at " + s.toFixed(2) + "s to " + e.toFixed(2) + "s), " + saved.length + " instance(s) adjusted");
  }

  function run() {
    var comp = app.project.activeItem, report = [];
    if (!(comp instanceof CompItem)) return ["Open a comp first."];
    var layers = comp.selectedLayers.length ? comp.selectedLayers : (function () { var a = []; for (var i = 1; i <= comp.numLayers; i++) a.push(comp.layer(i)); return a; })();
    var done = {}, found = 0;
    app.beginUndoGroup("Trim Precomps to Content");
    for (var i = 0; i < layers.length; i++) {
      var src = layers[i].source;
      if (!(src instanceof CompItem)) continue;
      found++;
      if (done[src.id]) continue;
      done[src.id] = true;
      try { trimComp(src, report); }
      catch (err) { report.push(src.name + ": ERROR, " + err.toString() + " (use Edit > Undo to revert this run)"); }
    }
    app.endUndoGroup();
    if (!found) report.push("No precomp layers " + (comp.selectedLayers.length ? "selected." : "in this comp."));
    return report;
  }

  var report = run();
  if ($.global.__trimPrecompsSilent) { $.global.__trimPrecompsReport = report.join("\n"); }
  else { alert("Trim Precomps to Content\n\n" + report.join("\n")); }
})();
