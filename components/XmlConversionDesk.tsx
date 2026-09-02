'use client';

import { useState } from 'react';
import FileSlot from './FileSlot';
import Stamp from './Stamp';
import WarningsPanel from './WarningsPanel';
import ResultsPanel, { OutputFile } from './ResultsPanel';
import { readXmlOrZipFiles, sanitizeFilename, downloadFilesAsZip } from '@/lib/client-files';
import { GovCbrAgentConfig } from '@/lib/types';

interface ActionState {
  busy: boolean;
  error: string | null;
  warnings: string[];
  files: OutputFile[];
}

const idle: ActionState = { busy: false, error: null, warnings: [], files: [] };

function ActionResult({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div className="rounded-sm border border-warn/40 bg-warn/[0.06] px-3 py-2.5 text-sm text-warn">
        {state.error}
      </div>
    );
  }
  if (state.files.length === 0) return null;
  return (
    <div className="space-y-3">
      <Stamp label="Cleared" />
      <ResultsPanel files={state.files} zipName="converted.zip" />
      <WarningsPanel warnings={state.warnings} />
    </div>
  );
}

export default function XmlConversionDesk({
  config,
  setConfig,
  journeyId,
  setJourneyId,
  showConfig,
  setShowConfig,
}: {
  config: GovCbrAgentConfig;
  setConfig: (c: GovCbrAgentConfig) => void;
  journeyId: string;
  setJourneyId: (v: string) => void;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
}) {
  const [headerFile, setHeaderFile] = useState<File[]>([]);
  const [blFiles, setBlFiles] = useState<File[]>([]);
  const [registerFile, setRegisterFile] = useState<File[]>([]);

  const [headerState, setHeaderState] = useState<ActionState>(idle);
  const [blsState, setBlsState] = useState<ActionState>(idle);
  const [registerState, setRegisterState] = useState<ActionState>(idle);
  const [mergeState, setMergeState] = useState<ActionState>(idle);

  const [target, setTarget] = useState<'bodogwu' | 'govcbr'>('bodogwu');
  const [sen, setSen] = useState('');
  const [tin, setTin] = useState('');
  const [indicator, setIndicator] = useState<'I' | 'O'>('I');

  async function convertHeader() {
    if (headerFile.length === 0) {
      setHeaderState({ ...idle, error: 'Upload a manifest header XML file first.' });
      return;
    }
    setHeaderState({ ...idle, busy: true });
    try {
      const [headerXml] = await readXmlOrZipFiles(headerFile);
      const res = await fetch('/api/convert/xml-to-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part: 'header', headerXml, target: 'bodogwu' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Conversion failed.');
      setHeaderState({
        busy: false,
        error: null,
        warnings: [],
        files: [{ filename: 'manifest-header.json', data: json.header }],
      });
    } catch (e: any) {
      setHeaderState({ ...idle, error: e.message });
    }
  }

  async function convertBls() {
    if (blFiles.length === 0) {
      setBlsState({ ...idle, error: 'Upload one or more BL XML files (or a zip of them) first.' });
      return;
    }
    setBlsState({ ...idle, busy: true });
    try {
      const blXmls = await readXmlOrZipFiles(blFiles);
      const res = await fetch('/api/convert/xml-to-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part: 'bls', blXmls, target: 'bodogwu' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Conversion failed.');
      const bls: any[] = json.bls;
      const files: OutputFile[] = bls.map((bl, i) => {
        const ref = bl?.identificationSegment?.bolReference || `bl-${i + 1}`;
        return { filename: `BL_${sanitizeFilename(ref)}.json`, data: bl };
      });
      setBlsState({ busy: false, error: null, warnings: [], files });
      if (files.length > 1) {
        await downloadFilesAsZip(files, 'bls.zip');
      }
    } catch (e: any) {
      setBlsState({ ...idle, error: e.message });
    }
  }

  async function convertRegister() {
    if (registerFile.length === 0) {
      setRegisterState({ ...idle, error: 'Upload a register XML file first.' });
      return;
    }
    setRegisterState({ ...idle, busy: true });
    try {
      const [registerXml] = await readXmlOrZipFiles(registerFile);
      const res = await fetch('/api/convert/xml-to-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part: 'register', registerXml, target: 'bodogwu' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Conversion failed.');
      setRegisterState({
        busy: false,
        error: null,
        warnings: [],
        files: [{ filename: 'register.json', data: json.register }],
      });
    } catch (e: any) {
      setRegisterState({ ...idle, error: e.message });
    }
  }

  async function convertMerged() {
    if (headerFile.length === 0 || blFiles.length === 0) {
      setMergeState({
        ...idle,
        error: 'Upload the manifest header XML and at least one BL XML (or a zip of them).',
      });
      return;
    }
    if (target === 'govcbr') {
      if (!sen.trim()) {
        setMergeState({ ...idle, error: 'SEN is required to produce a GovCBR file.' });
        return;
      }
      if (!tin.trim()) {
        setMergeState({ ...idle, error: 'TIN is required to produce a GovCBR file.' });
        return;
      }
    }
    setMergeState({ ...idle, busy: true });
    try {
      const [headerXml] = await readXmlOrZipFiles(headerFile);
      const blXmls = await readXmlOrZipFiles(blFiles);
      const registerXmls = registerFile.length > 0 ? await readXmlOrZipFiles(registerFile) : [];

      const res = await fetch('/api/convert/xml-to-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part: 'merge',
          headerXml,
          blXmls,
          registerXml: registerXmls[0],
          target,
          sen: target === 'govcbr' ? sen : undefined,
          tin: target === 'govcbr' ? tin : undefined,
          indicator,
          journeyId: journeyId || undefined,
          config,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Conversion failed.');

      const files: OutputFile[] =
        target === 'bodogwu'
          ? [{ filename: 'bodogwu.json', data: json.bodogwu }]
          : [{ filename: 'govcbr.json', data: json.data }];
      setMergeState({ busy: false, error: null, warnings: json.warnings || [], files });
    } catch (e: any) {
      setMergeState({ ...idle, error: e.message });
    }
  }

  return (
    <section className="ticket rounded-sm border-t-4 border-t-brass p-8 mb-8 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-brass-deep font-medium mb-1">Most manifests arrive this way</p>
        <h2 className="font-display text-2xl font-semibold text-ink">Raw XML</h2>
        <p className="text-sm text-slate mt-1.5 max-w-2xl">
          Upload <span className="data-field">TWM_Manifest</span> (header), one or more{' '}
          <span className="data-field">TWM_BOL</span> files — individually or as a .zip folder — and an
          optional <span className="data-field">eRegistrationRequest</span> (register). Convert each piece
          on its own, or all together.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <FileSlot
            label="Manifest header XML"
            hint="TWM_Manifest — one file"
            accept=".xml"
            files={headerFile}
            onChange={setHeaderFile}
          />
          <button
            onClick={convertHeader}
            disabled={headerState.busy}
            className="w-full rounded-sm border border-ink text-ink py-2 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-50 transition-colors"
          >
            {headerState.busy ? 'Converting…' : 'Convert header only'}
          </button>
          <ActionResult state={headerState} />
        </div>

        <div className="space-y-3">
          <FileSlot
            label="BL XML files"
            hint="TWM_BOL — files, or a .zip of them"
            accept=".xml,.zip"
            multiple
            files={blFiles}
            onChange={setBlFiles}
          />
          <button
            onClick={convertBls}
            disabled={blsState.busy}
            className="w-full rounded-sm border border-ink text-ink py-2 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-50 transition-colors"
          >
            {blsState.busy ? 'Converting…' : 'Convert BLs only'}
          </button>
          <ActionResult state={blsState} />
        </div>

        <div className="space-y-3">
          <FileSlot
            label="Register XML"
            hint="eRegistrationRequest — optional"
            accept=".xml"
            files={registerFile}
            onChange={setRegisterFile}
          />
          <button
            onClick={convertRegister}
            disabled={registerState.busy}
            className="w-full rounded-sm border border-ink text-ink py-2 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-50 transition-colors"
          >
            {registerState.busy ? 'Converting…' : 'Convert register only'}
          </button>
          <ActionResult state={registerState} />
        </div>
      </div>

      <div className="border-t border-paper-line pt-6 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate font-medium mb-1">Or, all together</p>
          <h3 className="font-display text-base font-semibold text-ink">Merge header + BLs → one manifest</h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1.5">Convert to</label>
          <div className="flex gap-2 max-w-sm">
            {(['bodogwu', 'govcbr'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`flex-1 rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                  target === t
                    ? 'border-brass bg-brass/10 text-ink'
                    : 'border-paper-line text-slate hover:border-brass/60'
                }`}
              >
                {t === 'bodogwu' ? "B'Odogwu (JSON)" : 'GovCBR'}
              </button>
            ))}
          </div>
        </div>

        {target === 'govcbr' && (
          <div className="space-y-4 max-w-2xl">
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
                  placeholder="e.g. 01313714-0001"
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
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">NIMASA terminal agent code</label>
              <input
                type="text"
                value={config.nimasaTermAgtCode}
                onChange={(e) => setConfig({ ...config, nimasaTermAgtCode: e.target.value })}
                placeholder="AGENT-BP001100"
                className="data-field w-full rounded-sm border border-paper-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brass"
              />
              <p className="text-xs text-slate mt-1">Optional — defaults to AGENT-BP001100.</p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="text-xs text-brass-deep underline underline-offset-2"
              >
                {showConfig ? 'Hide' : 'Show'} agent settings
              </button>
              {showConfig && (
                <div className="mt-3 rounded-sm border border-paper-line bg-paper p-4">
                  <label className="block text-xs font-medium text-ink-soft mb-1">Journey ID</label>
                  <input
                    type="text"
                    value={journeyId}
                    onChange={(e) => setJourneyId(e.target.value)}
                    placeholder="defaults to the manifest's registry number"
                    className="data-field w-full rounded-sm border border-paper-line bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-brass"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={convertMerged}
          disabled={mergeState.busy}
          className="w-full max-w-sm rounded-sm bg-ink text-paper py-2.5 text-sm font-medium hover:bg-ink-soft disabled:opacity-50 transition-colors"
        >
          {mergeState.busy ? 'Converting…' : target === 'bodogwu' ? "Merge & convert to B'Odogwu" : 'Merge & convert to GovCBR'}
        </button>
        <ActionResult state={mergeState} />
      </div>
    </section>
  );
}
