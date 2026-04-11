import React, { startTransition, useEffect, useState } from 'react';
import axios from 'axios';
import Spinner from './components/Spinner';
import FileUpload from './components/FileUpload';
import Header from './components/Header';
import './App.css';
import { normalizeBpmnFiles, summarizeFiles } from './utils/fileTools';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const DRAFT_STORAGE_KEY = 'loomaxis-studio:draft';

const GATEWAY_PRESETS = [
  {
    label: 'Local Zeebe',
    address: 'localhost:26500',
    note: 'Developer workstation or desktop Docker setup.',
  },
  {
    label: 'Compose Network',
    address: 'host.docker.internal:26500',
    note: 'Useful when the broker is running in a local container.',
  },
  {
    label: 'Camunda SaaS',
    address: 'your-cluster.zeebe.camunda.io:443',
    note: 'Start here when targeting a secure remote cluster.',
  },
];

const AUTH_OPTIONS = [
  {
    value: 'none',
    title: 'Direct gateway',
    description: 'Use a plain host:port target with no credential profile attached.',
  },
  {
    value: 'basic',
    title: 'Basic profile',
    description: 'Prepare a username/password context for protected gateways.',
  },
  {
    value: 'oauth',
    title: 'OAuth 2.0 profile',
    description: 'Capture identity metadata used in managed Zeebe environments.',
  },
];

const RUNBOOK_STEPS = [
  {
    title: 'Validate before you throw traffic at the broker',
    description: 'The studio tests TCP reachability first so broken endpoints are obvious early.',
  },
  {
    title: 'Stage BPMN assets like a release package',
    description: 'Uploads are filtered down to BPMN files and summarized before deployment.',
  },
  {
    title: 'Read deployment outcomes as an operations feed',
    description: 'Successes, failures, and backend warnings stay grouped in one deployment timeline.',
  },
];

const IDLE_CONNECTION_STATUS = {
  tone: 'idle',
  label: 'Awaiting validation',
  message: 'Point the studio at a Zeebe gateway and run a handshake test.',
  topology: null,
};

function readStoredDraft() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'Not available yet';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

function buildAuthData({
  authType,
  username,
  password,
  clientId,
  clientSecret,
  oauthTokenUrl,
  oauthAudience,
  oauthScope,
}) {
  const authData = { auth_type: authType };

  if (authType === 'basic') {
    authData.username = username;
    authData.password = password;
  }

  if (authType === 'oauth') {
    authData.client_id = clientId;
    authData.client_secret = clientSecret;
    authData.oauth_token_url = oauthTokenUrl;
    authData.oauth_audience = oauthAudience;
    authData.oauth_scope = oauthScope;
  }

  return authData;
}

function App() {
  const savedDraft = readStoredDraft();

  const [files, setFiles] = useState([]);
  const [zeebeAddress, setZeebeAddress] = useState(savedDraft.zeebeAddress || '');
  const [results, setResults] = useState([]);
  const [deployMeta, setDeployMeta] = useState(null);
  const [serviceWarnings, setServiceWarnings] = useState([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(IDLE_CONNECTION_STATUS);
  const [workspaceNotice, setWorkspaceNotice] = useState('Stage BPMN workflows to prepare the deck for deployment.');
  const [lastActivity, setLastActivity] = useState('The command deck is standing by.');

  const [authType, setAuthType] = useState(savedDraft.authType || 'none');
  const [username, setUsername] = useState(savedDraft.username || '');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState(savedDraft.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [oauthTokenUrl, setOauthTokenUrl] = useState(savedDraft.oauthTokenUrl || '');
  const [oauthAudience, setOauthAudience] = useState(savedDraft.oauthAudience || '');
  const [oauthScope, setOauthScope] = useState(savedDraft.oauthScope || '');

  const fileSummary = summarizeFiles(files);
  const successCount = results.filter((result) => result.success).length;
  const failureCount = results.filter((result) => !result.success).length;
  const successRate = results.length > 0 ? `${Math.round((successCount / results.length) * 100)}%` : 'No run yet';
  const authDefinition = AUTH_OPTIONS.find((option) => option.value === authType) || AUTH_OPTIONS[0];
  const latestTimestamp = deployMeta?.timestamp || deployMeta?.completed_at || null;
  const readinessMessage = !zeebeAddress.trim()
    ? 'Add a gateway endpoint to arm the deploy action.'
    : fileSummary.count === 0
      ? 'Stage at least one BPMN file to create a deployment package.'
      : 'Deployment package is ready to ship.';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextDraft = {
      zeebeAddress,
      authType,
      username,
      clientId,
      oauthTokenUrl,
      oauthAudience,
      oauthScope,
    };

    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
    } catch {
      // Local storage is best-effort only.
    }
  }, [zeebeAddress, authType, username, clientId, oauthTokenUrl, oauthAudience, oauthScope]);

  function stageFiles(nextFiles, sourceLabel, append = false) {
    const normalizedFiles = normalizeBpmnFiles(nextFiles);
    const unsupportedCount = nextFiles.length - normalizedFiles.length;

    if (normalizedFiles.length === 0) {
      setWorkspaceNotice('No BPMN files were detected in the selection.');
      return;
    }

    startTransition(() => {
      setFiles((currentFiles) => (
        append ? normalizeBpmnFiles([...currentFiles, ...normalizedFiles]) : normalizedFiles
      ));
    });

    setWorkspaceNotice(
      unsupportedCount > 0
        ? `${normalizedFiles.length} BPMN workflows staged from ${sourceLabel}. Ignored ${unsupportedCount} non-BPMN file${unsupportedCount === 1 ? '' : 's'}.`
        : `${normalizedFiles.length} BPMN workflow${normalizedFiles.length === 1 ? '' : 's'} staged from ${sourceLabel}.`
    );
    setLastActivity(`Updated the staging area using ${sourceLabel}.`);
  }

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    stageFiles(selectedFiles, 'manual selection');
  }

  async function handleUseSample() {
    setIsLoadingSample(true);
    setWorkspaceNotice('Loading the bundled sample workflow...');

    try {
      const response = await fetch('/samples/order-fulfillment.bpmn');
      const xml = await response.text();
      const sampleFile = new File([xml], 'order-fulfillment.bpmn', {
        type: 'application/xml',
        lastModified: Date.now(),
      });

      stageFiles([sampleFile], 'the bundled sample');
    } catch (error) {
      setWorkspaceNotice(`Unable to load the bundled sample: ${error.message}`);
    } finally {
      setIsLoadingSample(false);
    }
  }

  function resetWorkspace() {
    startTransition(() => {
      setFiles([]);
      setResults([]);
      setDeployMeta(null);
    });

    setServiceWarnings([]);
    setWorkspaceNotice('Workspace cleared. Stage another set of BPMN workflows when you are ready.');
    setLastActivity('Cleared the current deployment package.');
  }

  async function handleDeploy() {
    if (!zeebeAddress.trim() || fileSummary.count === 0) {
      startTransition(() => {
        setResults([
          {
            file: 'Deployment package',
            success: false,
            message: 'Enter a Zeebe gateway and stage at least one BPMN file before deploying.',
            type: 'validation',
          },
        ]);
      });
      setWorkspaceNotice('The deploy action is locked until both a gateway and BPMN package are present.');
      return;
    }

    const formData = new FormData();
    formData.append('zeebe_address', zeebeAddress.trim());
    formData.append(
      'auth_data',
      JSON.stringify(buildAuthData({
        authType,
        username,
        password,
        clientId,
        clientSecret,
        oauthTokenUrl,
        oauthAudience,
        oauthScope,
      }))
    );

    files.forEach((file) => {
      formData.append('files', file);
    });

    setIsDeploying(true);
    setWorkspaceNotice('Deployment is in flight. Hold steady while the studio talks to Zeebe.');
    setServiceWarnings([]);

    try {
      const response = await axios.post(`${API_BASE_URL}/deploy`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        validateStatus: () => true,
      });

      const payload = response.data || {};
      const nextResults = payload.results || [];

      startTransition(() => {
        setResults(nextResults);
        setDeployMeta(payload.summary || payload.meta || null);
      });

      setServiceWarnings(payload.warnings || []);
      setLastActivity(`Deployment run completed against ${zeebeAddress.trim()}.`);
      setWorkspaceNotice(
        nextResults.length > 0
          ? `Deployment finished with ${nextResults.filter((result) => result.success).length} successful workflow${nextResults.filter((result) => result.success).length === 1 ? '' : 's'}.`
          : 'Deployment finished, but the backend did not report any workflow-level results.'
      );
    } catch (error) {
      const errorMessage = error.response?.data?.detail
        || error.response?.data?.message
        || error.message
        || 'An unexpected deployment error occurred';

      startTransition(() => {
        setResults([
          {
            file: 'Deployment service',
            success: false,
            message: errorMessage,
            type: 'error',
          },
        ]);
      });

      setLastActivity('Deployment run failed before a full result set was returned.');
      setWorkspaceNotice('The backend failed before the deployment feed could be completed.');
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleTestConnection() {
    if (!zeebeAddress.trim()) {
      setConnectionStatus({
        tone: 'error',
        label: 'Gateway required',
        message: 'Enter a host:port gateway before running a handshake test.',
        topology: null,
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus({
      tone: 'testing',
      label: 'Handshake in progress',
      message: 'Running a network reachability check and a Zeebe topology probe.',
      topology: null,
    });

    try {
      const formData = new FormData();
      formData.append('zeebe_address', zeebeAddress.trim());
      formData.append(
        'auth_data',
        JSON.stringify(buildAuthData({
          authType,
          username,
          password,
          clientId,
          clientSecret,
          oauthTokenUrl,
          oauthAudience,
          oauthScope,
        }))
      );

      const response = await axios.post(`${API_BASE_URL}/test-connection`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        validateStatus: () => true,
      });

      const payload = response.data || {};
      setServiceWarnings(payload.warnings || []);

      if (response.status >= 200 && response.status < 300) {
        setConnectionStatus({
          tone: 'success',
          label: 'Gateway validated',
          message: payload.message || 'Connection successful.',
          topology: payload.topology || null,
        });
        setLastActivity(`Validated the gateway connection for ${zeebeAddress.trim()}.`);
      } else {
        setConnectionStatus({
          tone: 'error',
          label: 'Connection rejected',
          message: payload.message || `Gateway test failed with status ${response.status}.`,
          topology: payload.topology || null,
        });
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail
        || error.response?.data?.message
        || error.message
        || 'Connection failed';

      setConnectionStatus({
        tone: 'error',
        label: 'Connection failed',
        message: errorMessage,
        topology: null,
      });
    } finally {
      setIsTestingConnection(false);
    }
  }

  function handlePresetSelection(preset) {
    setZeebeAddress(preset.address);
    setConnectionStatus(IDLE_CONNECTION_STATUS);
    setLastActivity(`Loaded the ${preset.label} connection preset.`);
  }

  function renderAuthFields() {
    if (authType === 'basic') {
      return (
        <div className="field-stack">
          <div className="field-grid">
            <div className="field-group">
              <label className="field-label" htmlFor="username">Username</label>
              <input
                id="username"
                className="field-input"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="workflow.operator"
                autoComplete="username"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="field-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
          </div>
        </div>
      );
    }

    if (authType === 'oauth') {
      return (
        <div className="field-stack">
          <div className="field-grid">
            <div className="field-group">
              <label className="field-label" htmlFor="client-id">Client ID</label>
              <input
                id="client-id"
                className="field-input"
                type="text"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="loomaxis-studio"
                autoComplete="username"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="client-secret">Client Secret</label>
              <input
                id="client-secret"
                className="field-input"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="Enter client secret"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="token-url">Token URL</label>
            <input
              id="token-url"
              className="field-input"
              type="url"
              value={oauthTokenUrl}
              onChange={(event) => setOauthTokenUrl(event.target.value)}
              placeholder="https://login.example.com/oauth/token"
            />
          </div>

          <div className="field-grid">
            <div className="field-group">
              <label className="field-label" htmlFor="audience">Audience</label>
              <input
                id="audience"
                className="field-input"
                type="text"
                value={oauthAudience}
                onChange={(event) => setOauthAudience(event.target.value)}
                placeholder="zeebe-api"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="scope">Scope</label>
              <input
                id="scope"
                className="field-input"
                type="text"
                value={oauthScope}
                onChange={(event) => setOauthScope(event.target.value)}
                placeholder="zeebe.read zeebe.write"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="informational-tile">
        <strong>No credential profile selected.</strong>
        <span>
          This mode is ideal for local Zeebe development and containerized broker demos.
        </span>
      </div>
    );
  }

  return (
    <div className="studio-page">
      <div className="studio-aurora studio-aurora-one" />
      <div className="studio-aurora studio-aurora-two" />
      <div className="studio-gridlines" />

      <main className="studio-shell">
        <Header
          filesCount={fileSummary.count}
          formattedSize={fileSummary.formattedSize}
          authLabel={authDefinition.title}
          connectionLabel={connectionStatus.label}
          connectionTone={connectionStatus.tone}
          lastActivity={lastActivity}
          successRate={successRate}
          readinessMessage={readinessMessage}
        />

        <div className="studio-layout">
          <aside className="left-rail">
            <section className="panel panel-emphasis">
              <div className="panel-heading">
                <p className="panel-kicker">Connection canvas</p>
                <h2>Target your Zeebe gateway</h2>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="zeebe-address">Gateway address</label>
                <input
                  id="zeebe-address"
                  className="field-input"
                  type="text"
                  value={zeebeAddress}
                  onChange={(event) => setZeebeAddress(event.target.value)}
                  placeholder="localhost:26500"
                  aria-describedby="gateway-hint"
                />
                <p className="field-hint" id="gateway-hint">
                  Use a host:port target such as <code>localhost:26500</code> or <code>your-cluster.zeebe.camunda.io:443</code>.
                </p>
              </div>

              <div className="preset-list">
                {GATEWAY_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`preset-card ${zeebeAddress === preset.address ? 'preset-card-active' : ''}`}
                    onClick={() => handlePresetSelection(preset)}
                  >
                    <span className="preset-title">{preset.label}</span>
                    <span className="preset-address">{preset.address}</span>
                    <span className="preset-note">{preset.note}</span>
                  </button>
                ))}
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                >
                  {isTestingConnection ? <Spinner size={16} text="Testing" variant="light" /> : 'Test gateway'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setZeebeAddress('');
                    setConnectionStatus(IDLE_CONNECTION_STATUS);
                    setLastActivity('Reset the gateway target.');
                  }}
                >
                  Reset target
                </button>
              </div>

              <div className={`status-banner status-banner-${connectionStatus.tone}`}>
                <div className="status-banner-head">
                  <span className="status-indicator" />
                  <strong>{connectionStatus.label}</strong>
                </div>
                <p>{connectionStatus.message}</p>

                {connectionStatus.topology && (
                  <div className="topology-grid">
                    <div className="topology-card">
                      <span>Brokers</span>
                      <strong>{connectionStatus.topology.brokers_count ?? connectionStatus.topology.brokersCount ?? 'n/a'}</strong>
                    </div>
                    <div className="topology-card">
                      <span>Cluster size</span>
                      <strong>{connectionStatus.topology.cluster_size ?? connectionStatus.topology.clusterSize ?? 'n/a'}</strong>
                    </div>
                    <div className="topology-card">
                      <span>Partitions</span>
                      <strong>{connectionStatus.topology.partition_count ?? connectionStatus.topology.partitionCount ?? 'n/a'}</strong>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <p className="panel-kicker">Security profile</p>
                <h2>Shape the authentication context</h2>
              </div>

              <div className="auth-selector">
                {AUTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`auth-chip ${authType === option.value ? 'auth-chip-active' : ''}`}
                    onClick={() => setAuthType(option.value)}
                  >
                    <span>{option.title}</span>
                  </button>
                ))}
              </div>

              <p className="section-copy">{authDefinition.description}</p>
              {renderAuthFields()}
            </section>

            <section className="panel panel-dark">
              <div className="panel-heading panel-heading-dark">
                <p className="panel-kicker">Runbook</p>
                <h2>What this studio optimizes</h2>
              </div>

              <div className="runbook-list">
                {RUNBOOK_STEPS.map((step) => (
                  <div key={step.title} className="runbook-item">
                    <div className="runbook-number" />
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="main-stage">
            <section className="panel workspace-panel">
              <div className="panel-heading panel-heading-row">
                <div>
                  <p className="panel-kicker">Workflow staging</p>
                  <h2>Assemble a deployment package</h2>
                </div>
                <span className="surface-badge">{workspaceNotice}</span>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Staged workflows</span>
                  <strong>{fileSummary.count}</strong>
                  <p>Ready to be streamed to the gateway.</p>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Package weight</span>
                  <strong>{fileSummary.formattedSize}</strong>
                  <p>Total XML payload in the current deployment batch.</p>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Folder sources</span>
                  <strong>{fileSummary.folderCount || (fileSummary.count > 0 ? 1 : 0)}</strong>
                  <p>{fileSummary.folderCount > 0 ? fileSummary.folders.join(', ') : 'Manual selection only'}</p>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Current readiness</span>
                  <strong>{readinessMessage}</strong>
                  <p>{authDefinition.title} is attached to this package.</p>
                </div>
              </div>

              <FileUpload
                onFileChange={handleFileChange}
                files={files}
                onLoadSample={handleUseSample}
                isLoadingSample={isLoadingSample}
              />

              <div className="button-row button-row-wide">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleDeploy}
                  disabled={isDeploying}
                >
                  {isDeploying
                    ? <Spinner size={18} text="Deploying" variant="light" />
                    : `Deploy ${fileSummary.count || 0} workflow${fileSummary.count === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetWorkspace}
                  disabled={fileSummary.count === 0 && results.length === 0}
                >
                  Clear workspace
                </button>
              </div>
            </section>

            <section className="panel results-panel">
              <div className="panel-heading panel-heading-row">
                <div>
                  <p className="panel-kicker">Deployment feed</p>
                  <h2>Read the latest rollout</h2>
                </div>

                <div className="result-badges">
                  <span className="surface-badge surface-badge-soft">Success {successCount}</span>
                  <span className="surface-badge surface-badge-soft">Failed {failureCount}</span>
                  <span className="surface-badge surface-badge-soft">{latestTimestamp ? formatTimestamp(latestTimestamp) : 'No completed rollout yet'}</span>
                </div>
              </div>

              {serviceWarnings.length > 0 && (
                <div className="warning-stack">
                  {serviceWarnings.map((warning) => (
                    <div key={warning} className="warning-banner">
                      <strong>Backend note</strong>
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {results.length === 0 ? (
                <div className="empty-feed">
                  <span className="empty-feed-kicker">No deployment events yet</span>
                  <h3>The feed will light up after your first rollout.</h3>
                  <p>
                    Run a gateway test, stage BPMN files, and deploy. Each workflow result appears here with clear outcome messaging.
                  </p>
                </div>
              ) : (
                <div className="result-list" role="log" aria-live="polite">
                  {results.map((result, index) => (
                    <article
                      key={`${result.file}-${index}`}
                      className={`result-card result-card-${result.success ? 'success' : result.type === 'validation' ? 'warning' : 'error'}`}
                    >
                      <div className="result-index">{String(index + 1).padStart(2, '0')}</div>
                      <div className="result-body">
                        <div className="result-head">
                          <h3>{result.file}</h3>
                          <span className={`result-pill result-pill-${result.success ? 'success' : result.type === 'validation' ? 'warning' : 'error'}`}>
                            {result.success ? 'Deployed' : result.type === 'validation' ? 'Validation' : 'Attention'}
                          </span>
                        </div>
                        <p>{result.message}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>

        <footer className="studio-footer">
          <span>Loomaxis Studio is connected to: {API_BASE_URL}</span>
          <span>Last activity: {lastActivity}</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
