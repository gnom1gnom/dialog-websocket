// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const projectId = 'dialogflowdemo-340213';
const location = 'global';
const agentId = 'ddf7ad00-8fc5-44db-9ed4-af58b71b5d8f';
const languageCode = 'en';

const { SessionsClient } = require('@google-cloud/dialogflow-cx');
const client = new SessionsClient();

async function onMessage(msg) {
  console.log('chat message', msg);
  io.emit('chat message', msg);

  let sessionId = this.id; // socket.id
  let rsp = await detectIntentText(sessionId, msg);
  io.emit('chat message', rsp);
}

async function detectIntentText(sessionId, query) {
  const sessionPath = client.projectLocationAgentSessionPath(
    projectId,
    location,
    agentId,
    sessionId
  );
  console.info(sessionPath);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
      },
      languageCode,
    },
  };
  let rsp = '';
  const [response] = await client.detectIntent(request);
  console.log(`User Query: ${query}`);
  for (const message of response.queryResult.responseMessages) {
    if (message.text) {
      console.log(`Agent Response: ${message.text.text}`);
      rsp += message.text.text + '. ';
    }
  }
  if (response.queryResult.match.intent) {
    console.log(
      `Matched Intent: ${response.queryResult.match.intent.displayName}`
    );
  }
  console.log(
    `Current Page: ${response.queryResult.currentPage.displayName}`
  );

  return rsp;
}


// [START appengine_websockets_app]
const app = require('express')();
app.set('view engine', 'pug');

const server = require('http').Server(app);
const io = require('socket.io')(server);

app.get('/', (req, res) => {
  res.render('index.pug');
});

io.on('connection', socket => {
  console.log(`user ${socket.id} connected`);

  socket.on('chat message', onMessage);
});

if (module === require.main) {
  const PORT = parseInt(process.env.PORT) || 8080;
  server.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
  });
}
// [END appengine_websockets_app]

module.exports = server;
