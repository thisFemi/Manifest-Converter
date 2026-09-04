'use client';

import { useState } from 'react';
import FileSlot from '@/components/FileSlot';
import Stamp from '@/components/Stamp';
import WarningsPanel from '@/components/WarningsPanel';
import ResultsPanel, { OutputFile } from '@/components/ResultsPanel';
import { readJsonFile, readJsonOrZipFiles, sanitizeFilename, downloadFilesAsZip } from '@/lib/client-files';
import { smartMergeBodogwuUploads } from '@/lib/smart-merge';
import { DEFAULT_AGENT_CONFIG, GovCbrAgentConfig } from '@/lib/types';
import XmlConversionDesk from '@/components/XmlConversionDesk';

type Mode = 'govcbr-to-bo' | 'bo-to-govcbr';

const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: 'govcbr-to-bo', label: 'GovCBR → B\'Odogwu', sub: 'Single upload' },
  { id: 'bo-to-govcbr', label: 'B\'Odogwu → GovCBR', sub: 'Any mix — full manifests, or header + BL(+register) segments' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('govcbr-to-bo');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [zipName, setZipName] = useState('converted.zip');

  // mode: GovCBR -> B'Odogwu
  const [govcbrFile, setGovcbrFile] = useState<File[]>([]);
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');

  // mode: B'Odogwu -> GovCBR. Files can be complete manifests, header
  // files, BL files (single or arrays), and/or a register file, uploaded
  // individually, in bulk, or zipped, in any mix — smartMergeBodogwuUploads
  // figures out how many manifests are actually present.
  const [boFile, setBoFile] = useState<File[]>([]);
  const [sen1, setSen1] = useState('');
  const [tin1, setTin1] = useState('');
  const [indicator1, setIndicator1] = useState<'I' | 'O'>('I');

  // advanced agent config, shared by both B'Odogwu -> GovCBR flows.
  // NIMASA agent code is surfaced as its own prominent field (below), so
  // this panel covers the remaining fields with no B'Odogwu source.
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<GovCbrAgentConfig>(DEFAULT_AGENT_CONFIG);
  const [journeyId, setJourneyId] = useState('');

  function resetResult() {
    setError(null);
    setWarnings([]);
    setOutputFiles([]);
  }


  async function handleGovcbrToBo() {
    resetResult();
    if (govcbrFile.length === 0) {
      setError('Upload a GovCBR file first.');
      return;
    }
    setBusy(true);
    try {
      const govCbr = await readJsonFile(govcbrFile[0]);
      const res = await fetch('/api/convert/govcbr-to-bodogwu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ govCbr, arrivalDate: arrivalDate || undefined, arrivalTime: arrivalTime || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Conversion failed.');
      const files: OutputFile[] = [
        { filename: 'bodogwu.json', data: json.bodogwu },
        { filename: 'SEN.json', data: json.sen },
      ];
      setOutputFiles(files);
      setZipName('bodogwu-and-sen.zip');
      setWarnings(json.warnings || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBoToGovcbr() {
    resetResult();
    if (boFile.length === 0) {
      setError(
        "Upload B'Odogwu file(s) first — a full manifest, a header file plus BL file(s) (and optional register), or a mix of these, as .json or .zip."
      );
      return;
    }
    if (!sen1.trim()) {
      setError('SEN is required to produce a GovCBR file.');
      return;
    }
    if (!tin1.trim()) {
      setError('TIN is required to produce a GovCBR file.');
      return;
    }
    setBusy(true);
    try {
      const items = await readJsonOrZipFiles(boFile);
      const { manifests, warnings: mergeWarnings } = smartMergeBodogwuUploads(items);

      if (manifests.length === 0) {
        throw new Error(
          [
            "Couldn't find a convertible B'Odogwu manifest in what was uploaded.",
            ...mergeWarnings,
          ].join(' ')
        );
      }

      const batch = manifests.length > 1;
      const files: OutputFile[] = [];
      const allWarnings: string[] = [...mergeWarnings];

      for (const m of manifests) {
        const res = await fetch('/api/convert/bodogwu-to-govcbr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bodogwu: { manifestHdr: m.manifestHdr, blSegments: m.blSegments },
            sen: sen1,
            tin: tin1,
            indicator: indicator1,
            journeyId: journeyId || undefined,
            config,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(batch ? `"${m.name}": ${json.error || 'Conversion failed.'}` : json.error || 'Conversion failed.');
        }
        files.push({ filename: batch ? `govcbr_${sanitizeFilename(m.name)}.json` : 'govcbr.json', data: json.data });
        for (const w of json.warnings || []) {
          allWarnings.push(batch ? `[${m.name}] ${w}` : w);
        }
      }

      setOutputFiles(files);
      setZipName('govcbr.zip');
      setWarnings(allWarnings);
      if (files.length > 1) {
        await downloadFilesAsZip(files, 'govcbr.zip');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-paper-line bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brass">National Single Window</p>
            <h1 className="font-display text-xl font-semibold">Manifest Conversion Desk</h1>
          </div>
          <p className="text-xs text-paper/60 data-field">GovCBR ⇄ B&apos;Odogwu</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <XmlConversionDesk
          config={config}
          setConfig={setConfig}
          journeyId={journeyId}
          setJourneyId={setJourneyId}
          showConfig={showConfig}
          setShowConfig={setShowConfig}
        />

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate font-medium mb-2 px-1">
            Already have B&apos;Odogwu or GovCBR as JSON?
          </p>
        </div>

        <div className="flex gap-1 mb-6 max-w-4xl">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                resetResult();
              }}
              className={`flex-1 rounded-t-sm border border-b-0 px-3 py-2.5 text-left transition-colors ${
                mode === m.id
                  ? 'ticket border-paper-line relative z-10 -mb-px'
                  : 'border-transparent bg-paper-line/40 text-slate hover:bg-paper-line/70'
              }`}
            >
              <p className={`text-sm font-medium ${mode === m.id ? 'text-ink' : ''}`}>{m.label}</p>
              <p className="text-xs text-slate">{m.sub}</p>
            </button>
          ))}
        </div>

        <div className="ticket rounded-sm rounded-tl-none p-6 space-y-6 max-w-4xl">
          {mode === 'govcbr-to-bo' && (
            <>
              <FileSlot
                label="GovCBR file"
                hint="senReferenceNumber + xmlString"
                files={govcbrFile}
                onChange={setGovcbrFile}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">Arrival date</label>
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
                  />
                  <p className="text-xs text-slate mt-1">GovCBR has no arrival date field — parsed into the manifest header.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">Arrival time</label>
                  <input
                    type="time"
                    step={1}
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
                  />
                </div>
              </div>
              <p className="text-xs text-slate">
                Outputs a B&apos;Odogwu single-upload file, plus a separate <span className="data-field">SEN.json</span> carrying the
                senReferenceNumber that has nowhere to live in the B&apos;Odogwu schema.
              </p>
              <button
                onClick={handleGovcbrToBo}
                disabled={busy}
                className="w-full rounded-sm bg-ink text-paper py-2.5 text-sm font-medium hover:bg-ink-soft disabled:opacity-50 transition-colors"
              >
                {busy ? 'Converting…' : 'Convert to B\'Odogwu'}
              </button>
            </>
          )}

          {mode === 'bo-to-govcbr' && (
            <>
              <FileSlot
                label="B'Odogwu file(s)"
                hint="a full manifest, OR header + BL file(s) (+ optional register) — mix freely, single, multiple, or a .zip"
                accept=".json,.zip"
                multiple
                files={boFile}
                onChange={setBoFile}
              />
              <p className="text-xs text-slate -mt-3">
                Upload whatever you have — one complete B&apos;Odogwu manifest, a header file plus one or more BL
                files (optionally with a Register.json), several manifests at once, or a .zip of any of these.
                The converter figures out how many manifests are actually present (matching headers to BLs by
                registry number when there&apos;s more than one) and converts each to its own GovCBR output.
              </p>
              <SenTinFields sen={sen1} setSen={setSen1} tin={tin1} setTin={setTin1} indicator={indicator1} setIndicator={setIndicator1} />
              <NimasaField config={config} setConfig={setConfig} />
              <AdvancedConfig
                show={showConfig}
                setShow={setShowConfig}
                config={config}
                setConfig={setConfig}
                journeyId={journeyId}
                setJourneyId={setJourneyId}
              />
              <button
                onClick={handleBoToGovcbr}
                disabled={busy}
                className="w-full rounded-sm bg-ink text-paper py-2.5 text-sm font-medium hover:bg-ink-soft disabled:opacity-50 transition-colors"
              >
                {busy ? 'Converting…' : 'Convert to GovCBR'}
              </button>
            </>
          )}

          {error && (
            <div className="rounded-sm border border-warn/40 bg-warn/[0.06] px-3 py-2.5 text-sm text-warn">
              {error}
            </div>
          )}

          {outputFiles.length > 0 && !error && (
            <>
              <Stamp label="Cleared" />
              <ResultsPanel files={outputFiles} zipName={zipName} />
              <WarningsPanel warnings={warnings} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SenTinFields({
  sen,
  setSen,
  tin,
  setTin,
  indicator,
  setIndicator,
}: {
  sen: string;
  setSen: (v: string) => void;
  tin: string;
  setTin: (v: string) => void;
  indicator: 'I' | 'O';
  setIndicator: (v: 'I' | 'O') => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">SEN</label>
        <input
          type="text"
          value={sen}
          onChange={(e) => setSen(e.target.value)}
          placeholder="e.g. 2026NPAFLM002222"
          className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">TIN</label>
        <input
          type="text"
          value={tin}
          onChange={(e) => setTin(e.target.value)}
          placeholder="e.g. 0000094-0001"
          className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Direction</label>
        <select
          value={indicator}
          onChange={(e) => setIndicator(e.target.value as 'I' | 'O')}
          className="w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
        >
          <option value="I">Inbound</option>
          <option value="O">Outbound</option>
        </select>
      </div>
    </div>
  );
}

function NimasaField({
  config,
  setConfig,
}: {
  config: GovCbrAgentConfig;
  setConfig: (c: GovCbrAgentConfig) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-1.5">NIMASA terminal agent code</label>
      <input
        type="text"
        value={config.nimasaTermAgtCode}
        onChange={(e) => setConfig({ ...config, nimasaTermAgtCode: e.target.value })}
        placeholder="e.g AGENT-BP001100"
        className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
      />
      
    </div>
  );
}

function AdvancedConfig({
  show,
  setShow,
  config,
  setConfig,
  journeyId,
  setJourneyId,
}: {
  show: boolean;
  setShow: (v: boolean) => void;
  config: GovCbrAgentConfig;
  setConfig: (c: GovCbrAgentConfig) => void;
  journeyId: string;
  setJourneyId: (v: string) => void;
}) {
  const fields: { key: keyof GovCbrAgentConfig; label: string }[] = [
    { key: 'rotationNo', label: 'Rotation number' },
    { key: 'functionCode', label: 'Function code' },
    { key: 'statusCode', label: 'Status code' },
    { key: 'typeCode', label: 'Type code' },
    { key: 'containerCode', label: 'Container code' },
    { key: 'actionCode', label: 'Action code' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'hsCode', label: 'HS code fallback' },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-xs text-brass-deep underline underline-offset-2"
      >
        {show ? 'Hide' : 'Show'} agent settings ({fields.length + 1} fields with no B&apos;Odogwu source)
      </button>
      {show && (
        <div className="mt-3 rounded-sm border border-paper-line bg-paper p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Journey ID</label>
            <input
              type="text"
              value={journeyId}
              onChange={(e) => setJourneyId(e.target.value)}
              placeholder="defaults to the manifest's registry number (same as FunctionalReferenceID)"
              className="data-field w-full rounded-sm border border-paper-line bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-brass"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-ink-soft mb-1">{label}</label>
                <input
                  type="text"
                  value={config[key]}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                  className="data-field w-full rounded-sm border border-paper-line bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-brass"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
