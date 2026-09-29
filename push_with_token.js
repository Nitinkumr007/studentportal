const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

const token = process.argv[2];

if (!token) {
  console.log('Usage: node push_with_token.js <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>');
  process.exit(1);
}

async function doPush() {
  const repoUrl = 'https://github.com/Nitinkumr007/studentportal.git';
  console.log(`Setting remote origin to ${repoUrl}...`);

  await git.addRemote({
    fs,
    dir: __dirname,
    remote: 'origin',
    url: repoUrl,
    force: true
  });

  console.log('Pushing main branch to GitHub using token auth...');
  try {
    const pushResult = await git.push({
      fs,
      http,
      dir: __dirname,
      remote: 'origin',
      ref: 'main',
      url: repoUrl,
      onAuth: () => ({
        username: 'Nitinkumr007',
        password: token,
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    });
    console.log('✅ SUCCESS! Successfully pushed code to GitHub repository!');
    console.log('Repository URL: https://github.com/Nitinkumr007/studentportal.git');
  } catch (err) {
    console.error('❌ Push failed:', err.message);
  }
}

doPush();
