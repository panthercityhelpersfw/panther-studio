import { analyzeLiveVocalFrame, type LiveVocalFrame } from "../audio/liveVocalDirector";

self.onmessage = (event: MessageEvent<{ id: string; frame: LiveVocalFrame; frameTimeSec?: number }>) => {
  const { id, frame, frameTimeSec } = event.data;
  const result = analyzeLiveVocalFrame(frame);
  self.postMessage({ id, result, frameTimeSec });
};
