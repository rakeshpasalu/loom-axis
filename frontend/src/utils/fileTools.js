export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function normalizeBpmnFiles(files = []) {
  const seen = new Set();

  return files
    .filter((file) => file?.name?.toLowerCase().endsWith('.bpmn'))
    .filter((file) => {
      const fingerprint = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;

      if (seen.has(fingerprint)) {
        return false;
      }

      seen.add(fingerprint);
      return true;
    })
    .sort((left, right) => {
      const leftPath = left.webkitRelativePath || left.name;
      const rightPath = right.webkitRelativePath || right.name;

      return leftPath.localeCompare(rightPath);
    });
}

export function summarizeFiles(files = []) {
  const folders = new Set();
  let totalSize = 0;

  files.forEach((file) => {
    totalSize += file.size || 0;

    if (file.webkitRelativePath) {
      folders.add(file.webkitRelativePath.split('/')[0]);
    }
  });

  return {
    count: files.length,
    totalSize,
    formattedSize: formatBytes(totalSize),
    folderCount: folders.size,
    folders: Array.from(folders),
  };
}
