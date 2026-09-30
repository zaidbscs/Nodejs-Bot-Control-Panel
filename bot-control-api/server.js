const express = require('express');
const pm2 = require('pm2');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3000;
const SECRET_API_KEY = 'my-super-secret-key-123';
const BASE_BOTS_DIR = 'C:\\Bots';

function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === SECRET_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
}

function formatUptime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
}

// System Stats & Bot List Combined Endpoint
app.get('/api/status', verifyApiKey, (req, res) => {
  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.list((err, list) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      const systemInfo = {
        uptimeFormatted: formatUptime(os.uptime()),
        totalMemory: `${Math.round(totalMem / 1024 / 1024 / 1024)} GB`,
        freeMemory: `${Math.round(usedMem / 1024 / 1024 / 1024)} GB (${Math.round((usedMem/totalMem)*100)}% used)`,
        cpus: os.cpus().length
      };

      res.json({ system: systemInfo, bots: list });
    });
  });
});

// Start bot via dropdown
app.post('/api/start-dropdown', verifyApiKey, (req, res) => {
  const { name, folder, file } = req.body;
  if (!name || !folder || !file) return res.status(400).json({ error: 'Provide name, folder, and entry file' });
  
  const script = path.join(BASE_BOTS_DIR, folder, file);
  if (!fs.existsSync(script)) {
    return res.status(404).json({ error: 'Selected script file does not exist' });
  }

  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.start({ script, name, cwd: path.dirname(script) }, (err, apps) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Bot '${name}' started successfully!`, apps });
    });
  });
});

app.post('/api/start', verifyApiKey, (req, res) => {
  const { name, script } = req.body;
  if (!name || !script) return res.status(400).json({ error: 'Provide both bot name and script path' });
  
  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.start({ script, name, cwd: path.dirname(script) }, (err, apps) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Bot '${name}' started successfully!`, apps });
    });
  });
});

// Fixed Stop Endpoint
app.post('/api/stop', verifyApiKey, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Provide bot name' });
  
  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.stop(name, (err) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Bot '${name}' stopped successfully!` });
    });
  });
});

app.post('/api/restart', verifyApiKey, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Provide bot name' });
  
  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.restart(name, (err) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Bot '${name}' restarted successfully!` });
    });
  });
});

app.post('/api/delete', verifyApiKey, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Provide bot name' });
  
  pm2.connect((err) => {
    if (err) return res.status(500).json({ error: err.message });
    pm2.delete(name, (err) => {
      pm2.disconnect();
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Bot '${name}' removed from PM2 monitoring successfully!` });
    });
  });
});

// Get List of All Bot Folders & Nested Files
app.get('/api/folders', verifyApiKey, (req, res) => {
  try {
    if (!fs.existsSync(BASE_BOTS_DIR)) {
      return res.json([]);
    }
    const folders = fs.readdirSync(BASE_BOTS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const folderName = dirent.name;
        const folderPath = path.join(BASE_BOTS_DIR, folderName);
        const files = getFilesList(folderPath, folderPath);
        return { name: folderName, files };
      });
    res.json(folders);
  } catch (ex) {
    res.status(500).json({ error: ex.message });
  }
});

function getFilesList(dir, rootDir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    list.forEach(file => {
      const filePath = path.join(dir, file.name);
      const relativePath = path.relative(rootDir, filePath);
      if (file.isDirectory()) {
        if (file.name !== '.git' && file.name !== 'node_modules') {
          results = results.concat(getFilesList(filePath, rootDir));
        }
      } else {
        results.push(relativePath);
      }
    });
  } catch (e) {}
  return results;
}

app.post('/api/read-file', verifyApiKey, (req, res) => {
  const { folder, filePath } = req.body;
  if (!folder || !filePath) return res.status(400).json({ error: 'Provide folder and filePath' });

  const absolutePath = path.join(BASE_BOTS_DIR, folder, filePath);
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'Requested file not found' });
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    res.json({ content });
  } catch (ex) {
    res.status(500).json({ error: ex.message });
  }
});

app.post('/api/save-file', verifyApiKey, (req, res) => {
  const { folder, filePath, content } = req.body;
  if (!folder || !filePath || content === undefined) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const absolutePath = path.join(BASE_BOTS_DIR, folder, filePath);
  try {
    const dirName = path.dirname(absolutePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(absolutePath, content, 'utf8');
    res.json({ message: 'File saved successfully!' });
  } catch (ex) {
    res.status(500).json({ error: ex.message });
  }
});

app.post('/api/clone', verifyApiKey, (req, res) => {
  const { sourceFolder, newFolderName } = req.body;
  if (!sourceFolder || !newFolderName) {
    return res.status(400).json({ error: 'Provide source folder and new backup name' });
  }

  const srcPath = path.join(BASE_BOTS_DIR, sourceFolder);
  const destPath = path.join(BASE_BOTS_DIR, newFolderName);

  if (!fs.existsSync(srcPath)) {
    return res.status(404).json({ error: 'Source folder does not exist' });
  }
  if (fs.existsSync(destPath)) {
    return res.status(400).json({ error: 'Destination folder name already exists' });
  }

  try {
    fs.cpSync(srcPath, destPath, { 
      recursive: true, 
      filter: (source) => !source.includes('node_modules') && !source.includes('.git') 
    });
    res.json({ message: `Bot directory cloned successfully as '${newFolderName}' (excluding node_modules)!` });
  } catch (ex) {
    res.status(500).json({ error: ex.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Control panel server running on port ${PORT}`));