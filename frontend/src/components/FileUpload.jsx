import React, { useState } from 'react';
import Spinner from './Spinner';
import FileList from './FileList';

function FileUpload({ onFileChange, files, onLoadSample, isLoadingSample }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    onFileChange({ target: { files: Array.from(event.dataTransfer.files || []) } });
  }

  function handleFolderInput(event) {
    onFileChange({ target: { files: Array.from(event.target.files || []) } });
  }

  return (
    <div className="upload-stack">
      <div
        className={`upload-zone ${isDragging ? 'upload-zone-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-zone-copy">
          <span className="upload-kicker">Batch-friendly staging</span>
          <h3>Drop BPMN workflows into the command deck</h3>
          <p>
            Bring in individual BPMN files, sweep a folder, or load the bundled sample workflow to demo the studio instantly.
          </p>
        </div>

        <div className="upload-actions">
          <div className="upload-option">
            <input
              id="bpmn-files"
              className="upload-input"
              type="file"
              multiple
              accept=".bpmn"
              onChange={onFileChange}
            />
            <label htmlFor="bpmn-files" className="upload-option-card">
              <span className="upload-option-title">Select BPMN files</span>
              <span className="upload-option-copy">Pick a curated workflow set from your machine.</span>
            </label>
          </div>

          <div className="upload-option">
            <input
              id="bpmn-folder"
              className="upload-input"
              type="file"
              multiple
              directory=""
              webkitdirectory=""
              onChange={handleFolderInput}
            />
            <label htmlFor="bpmn-folder" className="upload-option-card">
              <span className="upload-option-title">Select a folder</span>
              <span className="upload-option-copy">Capture every BPMN asset in a project directory.</span>
            </label>
          </div>

          <button type="button" className="secondary-button sample-button" onClick={onLoadSample} disabled={isLoadingSample}>
            {isLoadingSample ? <Spinner size={16} text="Preparing sample" /> : 'Load bundled sample'}
          </button>
        </div>

        <div className="upload-footnote">
          Only <code>.bpmn</code> files are staged. Drag-and-drop works for quick validation of a deployment batch.
        </div>
      </div>

      <FileList files={files} />
    </div>
  );
}

export default FileUpload;
