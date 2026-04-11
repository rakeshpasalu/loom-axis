import React from 'react';

function Spinner({ size = 18, text = null, variant = 'dark' }) {
  return (
    <span className={`spinner-inline spinner-inline-${variant}`}>
      <span className="spinner-visual" style={{ '--spinner-size': `${size}px` }} aria-hidden="true" />
      {text && <span>{text}</span>}
    </span>
  );
}

export default Spinner;
