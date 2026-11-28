// A watch URL follows one cash seat across hands. It never joins or controls the table.
export function mountWatch({ app, id, origin, esc, dogFor, cardHtml, slotHtml, layout, replay }) {
  const label = document.getElementById('live-text');
  const dot = document.getElementById('live-dot');
  app.innerHTML = '<section class="watch-view"><h1>Live table</h1><div class="player"><div class="stage" hidden></div><p role="status">Connecting to the table…</p></div></section>';
  const title = app.querySelector('h1');
  const stage = app.querySelector('.stage');
  const message = app.querySelector('[role=status]');
  const setStatus = (text, live = false) => {
    label.textContent = text;
    dot.className = live ? 'dot' : 'dot off';
  };
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    setStatus('Unavailable');
    message.textContent = 'This watch link is invalid.';
    return;
  }
  const url = origin + '/api/playground/watch/' + id;
  const read = (endpoint, signal) => fetch(endpoint, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  let timer, controller, finished = false, failures = 0, lastUpdate;
  function display(frame) {
    const own = frame.seats.findIndex(s => s.own);
    const seats = frame.seats;
    const positions = layout[Math.max(2, seats.length)];
    title.textContent = own >= 0 ? seats[own].name + '’s table' : 'Live table';
    const playing = frame.status === 'playing';
    const status = playing ? 'Hand ' + frame.hand + ' · ' + frame.street :
      frame.status === 'between' ? 'Between hands' : 'Waiting for players';
    setStatus('Live · ' + status, true);
    const chips = value => Number(value).toLocaleString('en-US');
    stage.hidden = false;
    stage.classList.remove('stale');
    stage.innerHTML = '<div class="pot"><img src="/game/grid-holdem/replay/assets/Chip5_Red.png" alt=""><b>' +
      chips(frame.pot) + '</b><span>POT</span><em>' + chips(frame.bigBlind / 2) + '/' + chips(frame.bigBlind) + '</em></div>' +
      '<div class="board">' + Array.from({ length: 5 }, (_, i) => frame.board[i] ? cardHtml(frame.board[i]) : slotHtml()).join('') + '</div>' +
      seats.map((s, i) => {
        const [x, y] = positions[(i - Math.max(0, own) + seats.length) % seats.length];
        const classes = ['seat', s.own && 'hero', s.acting && 'acting', s.folded && 'folded'].filter(Boolean).join(' ');
        const action = playing && (s.acting ? 'Acting' : s.action);
        return '<div class="' + classes + '" style="left:' + x + '%;top:' + y + '%">' +
          (action ? '<div class="bubble">' + esc(action) + '</div>' : '') +
          '<img class="dog" src="' + dogFor(s) + '" alt=""><div class="plate"><span class="nm">' + esc(s.name) +
          '</span><span class="stk">' + (s.own ? '<span class="posb">Your agent</span>' : '') +
          '<b>' + chips(s.stack) + '</b></span></div></div>' +
          (s.bet > 0 ? '<div class="bet" style="left:' + (x + (50 - x) * .32) + '%;top:' + (y + (50 - y) * .45) + '%">' + chips(s.bet) + '</div>' : '');
      }).join('');
    const acting = seats.find(s => s.acting);
    message.textContent = playing && acting ? acting.name + ' is acting.' : status;
  }
  function end(hasReplay) {
    finished = true;
    setStatus('Seat closed');
    stage.hidden = true;
    message.textContent = 'Your agent has left this table.';
    if (!hasReplay) return;
    const button = document.createElement('button');
    button.textContent = 'Replay my last hand';
    message.after(button);
    button.onclick = async () => {
      button.disabled = true;
      try {
        const response = await read(url + '/replay', AbortSignal.timeout(10000));
        if (!response.ok) throw Error();
        const body = await response.json();
        const container = document.createElement('div');
        button.after(container);
        try { replay(container, body.replay); }
        catch (error) { container.remove(); throw error; }
        stage.parentElement.replaceWith(container);
        title.textContent = 'Last hand at this seat';
        document.title = "Seat replay · GRID Hold'em";
        document.querySelector('.brand span').textContent = 'Seat replay';
        setStatus('Replay · last hand at this seat');
      } catch {
        message.textContent = 'Could not load your last hand. Try again.';
        button.disabled = false;
      }
    };
  }
  async function poll() {
    if (controller || finished || document.hidden) return;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      const response = await read(url, request.signal);
      if (controller !== request) return;
      if (response.status === 404) {
        finished = true;
        stage.hidden = true;
        setStatus('Unavailable');
        message.textContent = 'This watch link does not match a seat.';
        return;
      }
      if (!response.ok) throw Error();
      const frame = await response.json();
      if (controller !== request) return;
      failures = 0;
      if (frame.status === 'ended') end(frame.hasReplay);
      else { display(frame); lastUpdate = new Date(); }
    } catch {
      if (controller !== request) return;
      failures++;
      setStatus('Reconnecting');
      stage.classList.add('stale');
      message.textContent = lastUpdate ? 'Last update at ' + lastUpdate.toLocaleTimeString() + '. Reconnecting…' : 'Waiting for the table connection…';
    } finally {
      clearTimeout(timeout);
      if (controller === request) {
        controller = undefined;
        if (!finished && !document.hidden) timer = setTimeout(poll, Math.min(15000, 2000 * 2 ** Math.min(failures, 3)));
      }
    }
  }
  function pause() { clearTimeout(timer); controller?.abort(); controller = undefined; }
  function resume() { pause(); void poll(); }
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', event => { if (event.persisted) resume(); });
  void poll();
}
