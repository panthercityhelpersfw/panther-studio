import { useEffect, useState } from "react";
import { Analyzer } from "./Analyzer";
import { EffectsRack } from "./EffectsRack";
import { MasterPanel } from "./MasterPanel";
import { Mixer } from "./Mixer";
import { PadGrid } from "./PadGrid";
import { VocalLab } from "./VocalLab";
import { MixAssistant } from "./MixAssistant";
import { StudioIntelligencePanel } from "./StudioIntelligencePanel";
import { FutureStudioPanel } from "./FutureStudioPanel";
import { ProducerTeamPanel } from "./ProducerTeamPanel";
import { AutomationPanel } from "./AutomationPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { HolographicMixView } from "./HolographicMixView";
import { LyricStudio } from "./LyricStudio";
import { AIProducerSuite } from "./AIProducerSuite";

type Tab = "suite" | "mixer" | "holo" | "lyrics" | "workflow" | "automation" | "fx" | "vocal" | "future" | "team" | "intelligence" | "mixassist" | "master" | "pads" | "analyzer";

export function BottomDock({ onCollapse }: { onCollapse?: () => void }) {
  const [tab, setTab] = useState<Tab>("suite");

  useEffect(() => {
    const onDockTab = (e: Event) => {
      const next = (e as CustomEvent<Tab>).detail;
      if (next) setTab(next);
    };
    window.addEventListener("panther:bottomDockTab", onDockTab);
    return () => window.removeEventListener("panther:bottomDockTab", onDockTab);
  }, []);

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`studio-tab ${
        tab === id
          ? "is-active"
          : ""
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full shrink-0 studio-dock flex flex-col">
      <div className="studio-dock__tabs">
        <TabBtn id="suite" label="AI SUITE" />
        <TabBtn id="mixer" label="MIXER" />
        <TabBtn id="holo" label="HOLO MIX" />
        <TabBtn id="lyrics" label="LYRICS" />
        <TabBtn id="workflow" label="WORKFLOWS" />
        <TabBtn id="automation" label="AUTOMATION" />
        <TabBtn id="fx" label="FX RACK" />
        <TabBtn id="vocal" label="VOCAL LAB" />
        <TabBtn id="future" label="COMPASS" />
        <TabBtn id="team" label="PRODUCER TEAM" />
        <TabBtn id="intelligence" label="INTELLIGENCE" />
        <TabBtn id="mixassist" label="MIX ASSIST" />
        <TabBtn id="master" label="MASTER" />
        <TabBtn id="pads" label="PADS" />
        <TabBtn id="analyzer" label="ANALYZER" />
        <div className="flex-1" />
        {onCollapse && (
          <button onClick={onCollapse} className="studio-dock__collapse" title="Collapse dock">
            Minimize
          </button>
        )}
      </div>
      <div className="flex-1 flex min-h-0">
        {tab === "suite" && <AIProducerSuite />}
        {tab === "mixer" && <Mixer />}
        {tab === "holo" && <HolographicMixView />}
        {tab === "lyrics" && <LyricStudio />}
        {tab === "workflow" && <WorkflowPanel />}
        {tab === "automation" && <AutomationPanel />}
        {tab === "fx" && <EffectsRack />}
        {tab === "vocal" && <VocalLab />}
        {tab === "future" && <FutureStudioPanel />}
        {tab === "team" && <ProducerTeamPanel />}
        {tab === "intelligence" && <StudioIntelligencePanel />}
        {tab === "mixassist" && <MixAssistant />}
        {tab === "master" && <MasterPanel />}
        {tab === "pads" && <PadGrid />}
        {tab === "analyzer" && (
          <div className="flex-1 p-3 flex flex-col gap-2">
            <span className="text-[11px] text-gray-400">Master spectrum (real-time)</span>
            <Analyzer height={170} />
          </div>
        )}
      </div>
    </div>
  );
}
