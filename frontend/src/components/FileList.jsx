import React from 'react';
import { formatBytes, summarizeFiles } from '../utils/fileTools';

function FileList({ files }) {
  if (files.length === 0) {
    return null;
  }

  const summary = summarizeFiles(files);

  return (
    <div className="file-manifest">
      <div className="file-manifest-head">
        <div>
          <span className="upload-kicker">Deployment manifest</span>
          <h3>{summary.count} workflow{summary.count === 1 ? '' : 's'} staged</h3>
        </div>

        <div className="manifest-badges">
          <span className="surface-badge surface-badge-soft">{summary.formattedSize}</span>
          <span className="surface-badge surface-badge-soft">
            {summary.folderCount > 0 ? `${summary.folderCount} folder source${summary.folderCount === 1 ? '' : 's'}` : 'Direct selection'}
          </span>
        </div>
      </div>

      <div className="file-manifest-list">
        {files.map((file) => (
          <div key={`${file.webkitRelativePath || file.name}-${file.lastModified}`} className="file-row">
            <div className="file-row-icon">XML</div>
            <div className="file-row-copy">
              <strong>{file.name}</strong>
              <span>{file.webkitRelativePath || 'Selected directly from the workstation'}</span>
            </div>
            <span className="file-row-size">{formatBytes(file.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FileList;
