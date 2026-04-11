import React from 'react';

function Header({
  filesCount,
  formattedSize,
  authLabel,
  connectionLabel,
  connectionTone,
  lastActivity,
  successRate,
  readinessMessage,
}) {
  return (
    <header className="hero-card">
      <div className="hero-copy">
        <div className="brand-row">
          <div className="brand-lockup">
            <span className="hero-logo-badge" aria-hidden="true">
              <span className="hero-logo-core" />
            </span>
            <span className="brand-tag">Loomaxis Studio</span>
          </div>
          <span className={`signal-pill signal-pill-${connectionTone}`}>{connectionLabel}</span>
        </div>

        <p className="hero-kicker">Workflow deployment command deck</p>
        <h1>Deploy BPMN like an operations product, not a file picker.</h1>
        <p className="hero-description">
          This studio turns Zeebe deployments into a guided release surface with clear connection validation,
          confident staging, and readable rollout feedback for every workflow in the batch.
        </p>

        <div className="hero-chip-row">
          <span className="hero-chip">Zeebe handshake validation</span>
          <span className="hero-chip">Batch BPMN staging</span>
          <span className="hero-chip">Deployment-grade result feed</span>
        </div>
      </div>

      <div className="hero-console">
        <div className="hero-console-grid">
          <div className="hero-metric-card">
            <span>Staged workflows</span>
            <strong>{filesCount}</strong>
            <p>{formattedSize} currently loaded into the deployment package.</p>
          </div>
          <div className="hero-metric-card">
            <span>Security context</span>
            <strong>{authLabel}</strong>
            <p>Connection metadata attached to this release package.</p>
          </div>
          <div className="hero-metric-card">
            <span>Latest success rate</span>
            <strong>{successRate}</strong>
            <p>Measured from the most recent workflow result set.</p>
          </div>
          <div className="hero-metric-card">
            <span>Deck readiness</span>
            <strong>{readinessMessage}</strong>
            <p>{lastActivity}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
