/* global Office, Word */

import './taskpane.css';

const MUTATION_EVENTS = ['onParagraphAdded', 'onParagraphChanged', 'onParagraphDeleted'];

const state = {
  hasUntrackedChanges: false,
  trackedEvents: 0,
  untrackedEvents: 0,
  events: [],
};

let eventQueue = Promise.resolve();

Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Word) return;

  document.getElementById('reset-button').addEventListener('click', resetSession);

  if (!Office.context.requirements.isSetSupported('WordApi', '1.6')) {
    setListenerStatus('WordApi 1.6 required', true);
    setError('This Word client does not support paragraph mutation events.');
    return;
  }

  try {
    await registerMutationEvents();
    await refreshTrackingMode();
    setListenerStatus('Listening');
  } catch (error) {
    console.error(error);
    setListenerStatus('Listener failed', true);
    setError(error instanceof Error ? error.message : String(error));
  }
});

async function registerMutationEvents() {
  await Word.run(async (context) => {
    MUTATION_EVENTS.forEach((eventName) => {
      context.document[eventName].add(queueMutation);
    });

    await context.sync();
  });
}

function queueMutation(event) {
  if (event.source === Word.EventSource.remote || event.source === 'Remote') return;

  eventQueue = eventQueue
    .then(async () => {
      const mode = await readTrackingMode();
      const isUntracked = mode === Word.ChangeTrackingMode.off || mode === 'Off';

      if (isUntracked) {
        state.hasUntrackedChanges = true;
        state.untrackedEvents += 1;
      } else {
        state.trackedEvents += 1;
      }

      state.events.unshift({
        type: event.type,
        mode,
        isUntracked,
        paragraphCount: event.uniqueLocalIds?.length ?? 0,
        occurredAt: new Date(),
      });
      state.events = state.events.slice(0, 20);
      render();
    })
    .catch((error) => {
      console.error('Failed to inspect Word mutation.', error);
      setListenerStatus('Inspection error', true);
    });
}

async function readTrackingMode() {
  return Word.run(async (context) => {
    const wordDocument = context.document;
    wordDocument.load('changeTrackingMode');
    await context.sync();
    return wordDocument.changeTrackingMode;
  });
}

async function refreshTrackingMode() {
  const mode = await readTrackingMode();
  document.getElementById('tracking-mode').textContent = displayMode(mode);
}

function resetSession() {
  state.hasUntrackedChanges = false;
  state.trackedEvents = 0;
  state.untrackedEvents = 0;
  state.events = [];
  render();
  void refreshTrackingMode();
}

function render() {
  document.getElementById('tracked-count').textContent = String(state.trackedEvents);
  document.getElementById('untracked-count').textContent = String(state.untrackedEvents);

  const verdict = document.getElementById('verdict');
  const title = document.getElementById('verdict-title');
  const detail = document.getElementById('verdict-detail');
  verdict.className = `verdict ${state.hasUntrackedChanges ? 'verdict--blocked' : state.events.length ? 'verdict--clear' : 'verdict--idle'}`;
  title.textContent = state.hasUntrackedChanges
    ? 'Untracked edit detected'
    : state.events.length
      ? 'All observed edits were tracked'
      : 'Waiting for edits';
  detail.textContent = state.hasUntrackedChanges
    ? 'Block save for this editing session.'
    : state.events.length
      ? 'No local mutation was observed with tracking off.'
      : 'Local Word mutations will appear here.';

  document.getElementById('tracking-mode').textContent = state.events.length
    ? displayMode(state.events[0].mode)
    : document.getElementById('tracking-mode').textContent;

  const log = document.getElementById('event-log');
  log.replaceChildren();
  if (state.events.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'event-log__empty';
    empty.textContent = 'No mutations detected.';
    log.appendChild(empty);
    return;
  }

  state.events.forEach((event) => {
    const item = document.createElement('li');
    item.className = `event ${event.isUntracked ? 'event--untracked' : 'event--tracked'}`;
    item.innerHTML = `<div><strong>${escapeHtml(event.type)}</strong><span>${event.paragraphCount} paragraph(s)</span></div><div><b>${escapeHtml(displayMode(event.mode))}</b><time>${event.occurredAt.toLocaleTimeString()}</time></div>`;
    log.appendChild(item);
  });
}

function displayMode(mode) {
  if (mode === Word.ChangeTrackingMode.off || mode === 'Off') return 'Tracking off';
  if (mode === Word.ChangeTrackingMode.trackMineOnly || mode === 'TrackMineOnly') return 'Track mine only';
  if (mode === Word.ChangeTrackingMode.trackAll || mode === 'TrackAll') return 'Track all';
  return String(mode);
}

function setListenerStatus(message, isError = false) {
  const element = document.getElementById('listener-status');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

function setError(message) {
  const detail = document.getElementById('verdict-detail');
  detail.textContent = message;
  document.getElementById('verdict').className = 'verdict verdict--blocked';
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value);
  return element.innerHTML;
}
