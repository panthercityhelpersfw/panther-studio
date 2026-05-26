/**
 * Minimal Standard MIDI File (SMF, format 0) writer. Encodes a list of timed
 * notes into a real .mid file any DAW can open. Single track, one tempo.
 */
import type { MidiNote } from "../state/types";

function writeVarLen(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

interface Ev {
  tick: number;
  data: number[];
  order: number; // note-off before note-on at same tick
}

export function encodeMidiFile(notes: MidiNote[], tempo: number, ppq = 480): Blob {
  const tickPerSec = (ppq * tempo) / 60;
  const events: Ev[] = [];
  for (const n of notes) {
    const onTick = Math.round(n.startSec * tickPerSec);
    const offTick = Math.round((n.startSec + n.durationSec) * tickPerSec);
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
    events.push({ tick: onTick, data: [0x90, pitch, vel], order: 1 });
    events.push({ tick: offTick, data: [0x80, pitch, 0], order: 0 });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  // Tempo meta event (microseconds per quarter note).
  const usPerQ = Math.round(60000000 / tempo);
  track.push(0x00, 0xff, 0x51, 0x03, (usPerQ >> 16) & 0xff, (usPerQ >> 8) & 0xff, usPerQ & 0xff);

  let last = 0;
  for (const ev of events) {
    const delta = ev.tick - last;
    last = ev.tick;
    track.push(...writeVarLen(delta), ...ev.data);
  }
  // End of track.
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0, 0, 0, 6, // header length
    0, 0, // format 0
    0, 1, // one track
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const trkLen = track.length;
  const trkHeader = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (trkLen >> 24) & 0xff, (trkLen >> 16) & 0xff, (trkLen >> 8) & 0xff, trkLen & 0xff,
  ];

  const bytes = new Uint8Array(header.length + trkHeader.length + track.length);
  bytes.set(header, 0);
  bytes.set(trkHeader, header.length);
  bytes.set(track, header.length + trkHeader.length);
  return new Blob([bytes], { type: "audio/midi" });
}
