const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

const dir = __dirname;

async function runGitPipeline() {
  console.log('1. Initializing Git repository...');
  await git.init({ fs, dir });

  console.log('2. Staging files (excluding .env)...');
  
  // Get list of files in directory
  function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      if (file === '.git' || file === 'node_modules' || file === '.env' || file === 'scratch' || file === 'scratch_zip') return;
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(path.relative(dir, fullPath).replace(/\\/g, '/'));
      }
    });
    return arrayOfFiles;
  }

  const filesToAdd = getAllFiles(dir);
  console.log(`Staging ${filesToAdd.length} files...`);

  for (const file of filesToAdd) {
    await git.add({ fs, dir, filepath: file });
  }

  console.log('3. Committing files...');
  const sha = await git.commit({
    fs,
    dir,
    author: {
      name: 'Nitin Kumar',
      email: 'nitnrajput007@gmail.com'
    },
    message: 'Initial commit - BRDP Student & Fee Report Operational Portal'
  });
  console.log(`Commit created successfully: ${sha}`);

  console.log('4. Setting remote origin...');
  await git.addRemote({
    fs,
    dir,
    remote: 'origin',
    url: 'https://github.com/Nitinkumr007/studentportal.git',
    force: true
  });

  console.log('Git repository initialized and committed locally without .env file!');
}

runGitPipeline().catch(err => console.error('Git error:', err));
