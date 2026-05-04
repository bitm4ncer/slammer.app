// .slammerproj — JSON file with embedded data URLs. Self-contained portable format.
// Legacy .crushproj imports are accepted via the file-extension drop handler.

export async function exportProjectFile({ document: doc }) {
  const docCopy = JSON.parse(JSON.stringify(doc.serialize()));
  for (let i = 0; i < doc.layers.length; i++) {
    const src = doc.layers[i].source;
    if (src instanceof Blob) {
      docCopy.layers[i].source = await blobToDataURL(src);
    } else {
      docCopy.layers[i].source = src;
    }
  }
  const blob = new Blob([JSON.stringify(docCopy)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.state.name || 'project'}.slammerproj`;
  a.click();
}

export async function importProjectFile(file, doc) {
  const text = await file.text();
  const json = JSON.parse(text);
  doc.load(json);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
