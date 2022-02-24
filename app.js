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

/**
 * Example for regional endpoint:
 *   const location = 'us-central1'
 *   const client = new SessionsClient({apiEndpoint: 'us-central1-dialogflow.googleapis.com'})
 */
const df = require('@google-cloud/dialogflow-cx');
const dfClient = new df.SessionsClient();

const stt = require('@google-cloud/speech');
const sttClient = new stt.SpeechClient();

const audioFileName = 'audio.raw';
const encoding = 'AUDIO_ENCODING_LINEAR_16';
const sampleRateHertz = 16000;


const fs = require('fs');
const util = require('util');
const { Transform, pipeline } = require('stream');
const pump = util.promisify(pipeline);

async function detectIntentAudio(sessionId, audio, onResult) {
  // const sessionId = Math.random().toString(36).substring(7);
  const sessionPath = dfClient.projectLocationAgentSessionPath(
    projectId,
    location,
    agentId,
    sessionId
  );
  console.info(sessionPath);

  // Create a stream for the streaming request.
  const detectStream = dfClient
    .streamingDetectIntent()
    .on('error', console.error)
    .on('data', data => {
      if (data.recognitionResult) {
        console.log(
          `Intermediate Transcript: ${data.recognitionResult.transcript}`
        );
      } else {
        console.log('Detected Intent:');
        const result = data.detectIntentResponse.queryResult;

        console.log(`User Query: ${result.transcript}`);
        for (const message of result.responseMessages) {
          if (message.text) {
            console.log(`Agent Response: ${message.text.text}`);
            onResult(message.text.text);
          }
        }
        if (result.match.intent) {
          console.log(`Matched Intent: ${result.match.intent.displayName}`);
        }
        console.log(`Current Page: ${result.currentPage.displayName}`);
      }
    });

  // Write the initial stream request to config for audio input.
  const initialStreamRequest = {
    session: sessionPath,
    queryInput: {
      audio: {
        config: {
          audioEncoding: encoding,
          sampleRateHertz: sampleRateHertz,
          synthesize_speech_config: {
            voice: {
              // Set's the name and gender of the ssml voice
              name: 'en-GB-Standard-A',
              ssml_gender: 'SSML_VOICE_GENDER_FEMALE',
            },
          },
          singleUtterance: true,
        },
      },
      languageCode: languageCode,
    },
  };
  detectStream.write(initialStreamRequest);

  await pump(
    audio,
    // Format the audio stream into the request format.
    new Transform({
      objectMode: true,
      transform: (obj, _, next) => {
        next(null, {
          inputAudio: obj, outputAudioConfig: {
            audioEncoding: `OUTPUT_AUDIO_ENCODING_LINEAR_16`
          }
        });
      }
    }),
    stream
  );

  /*
  // Stream the audio from audio file to Dialogflow.
  await pump(
    // fs.createReadStream(audioFileName),
    audio,
    // Format the audio stream into the request format.
    new Transform({
      objectMode: true,
      transform: (obj, _, next) => {
        next(null, { queryInput: { audio: { audio: obj } } });
      },
    }),
    detectStream
  );
  */
}


async function detectIntentText(sessionId, query) {
  const sessionPath = dfClient.projectLocationAgentSessionPath(
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
  const [response] = await dfClient.detectIntent(request);
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

async function transcribeAudio(audio) {
  const request = {
    config: {
      sampleRateHertz: sampleRateHertz,
      encoding: encoding,
      languageCode: languageCode
    },
    interimResults: false,
    audio: {
      content: audio
    },
    //enableSpeakerDiarization: true,
    //diarizationSpeakerCount: 2,
    //model: `phone_call`
  }

  console.log(request);
  const response = await sttClient.recognize(request);
  return response;
}

const path = require('path');
const http = require('http');
const cors = require('cors');
const express = require('express')
const app = express();
app.use(cors());
app.use(express.static('client'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/index.html'));
});
const server = http.createServer(app);

const socketIo = require('socket.io');
const io = socketIo(server);

server.listen(8080, () => {
  console.log('Running server on port %s', 8080);
});

io.on('connection', socket => {
  console.log(`user ${socket.id} connected`);

  socket.on('chat message', onMessage);

  socket.on('message-transcribe', async function (data) {
    // we get the dataURL which was sent from the client
    const dataURL = data.audio.dataURL.split(',').pop();
    // we will convert it to a Buffer
    let fileBuffer = Buffer.from(dataURL, 'base64');
    const responses = await transcribeAudio(fileBuffer);

    let rsp = '';
    for (const response of responses) {
      if (response && response.results) {
        for (const result of response.results) {
          if (result && result.alternatives) {
            for (const alt of result.alternatives)
              if (alt && alt.transcript) {
                console.log(`Agent Response: ${alt.transcript}`);
                rsp += alt.transcript + '. ';
              }
          }
        }
      }
    }
    if (rsp.length == 0)
      rsp = 'Could not recognize your voice. Make sure your microphone is working.';

    onMessage(rsp, this.id);
  });

});

async function onMessage(msg, sessionId) {
  console.log('chat message', msg);
  io.emit('chat message', msg);

  if (!sessionId)
    sessionId = this.id; // socket.id

  let rsp = await detectIntentText(sessionId, msg);
  io.emit('bot message', rsp);
}


module.exports = server;
