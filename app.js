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

const path = require('path');
const http = require('http');
const cors = require('cors');
const express = require('express')

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


/*
 * Dialogflow Detect Intent based on Audio Stream
 * @param audio stream
 * @param cb Callback function to execute with results
 */
async function detectIntentStream(sessionId, audio, responseHandler) {
  const sessionPath = dfClient.projectLocationAgentSessionPath(
    projectId,
    location,
    agentId,
    sessionId
  );
  console.info(sessionPath);

  // Write request objects.
  // Thee first message must contain StreamingDetectIntentRequest.session, 
  // [StreamingDetectIntentRequest.query_input] plus optionally 
  // [StreamingDetectIntentRequest.query_params]. If the client wants 
  // to receive an audio response, it should also contain 
  // StreamingDetectIntentRequest.output_audio_config. 
  // The message must not contain StreamingDetectIntentRequest.input_audio.
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

  // execute the Dialogflow Call: streamingDetectIntent()
  const stream = dfClient.streamingDetectIntent()
    .on('data', data => {
      console.log(
        JSON.stringify(data, null, 2)
      );

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
          }
        }
        if (result.match.intent) {
          console.log(`Matched Intent: ${result.match.intent.displayName}`);
        }
        console.log(`Current Page: ${result.currentPage.displayName}`);

        responseHandler(result);
      }
    })
    .on('error', (e) => {
      console.log(e);
    })
    .on('end', () => {
      console.log('on end');
    });

  stream.write(initialStreamRequest);
  // pump is a small node module that pipes streams together and 
  // destroys all of them if one of them closes.
  await pump(
    //fs.createReadStream(filename),
    audio,
    // Format the audio stream into the request format.
    new Transform({
      objectMode: true,
      transform: (obj, _, next) => {
        next(null, { queryInput: { audio: { audio: obj } } });
      },
    }),
    stream
  );
};

async function detectIntentText(sessionId, text, responseHandler) {
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
        text: text,
      },
      languageCode,
    },
  };

  const [response] = await dfClient.detectIntent(request);
  console.log(`User Query: ${text}`);
  for (const message of response.queryResult.responseMessages) {
    if (message.text) {
      console.log(`Agent Response: ${message.text.text}`);
      responseHandler(message.text.text);
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
};

async function transcribeAudio(audio, responseHandler) {
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
  responseHandler(response);
}

const app = express();
app.use(cors());
app.use(express.static('client'))
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/index.html'));
});

const server = http.createServer(app);
server.listen(8080, () => {
  console.log('Running server on port %s', 8080);
});

const socketIo = require('socket.io');
const ss = require('socket.io-stream');
const io = socketIo(server);

io.on('connection', socket => {
  console.log(`user ${socket.id} connected`);
  socket.emit('server_setup', `Server connected [id=${socket.id}]`);

  socket.on('chat message', text => {
    console.log('chat message', text);
    socket.emit('chat message', text);

    detectIntentText(socket.id, text, async function (response) {
      socket.emit('bot message', response);
    });
  });

  socket.on('message-transcribe', async function (data) {
    // we get the dataURL which was sent from the client
    const dataURL = data.audio.dataURL.split(',').pop();
    // we will convert it to a Buffer
    let fileBuffer = Buffer.from(dataURL, 'base64');

    transcribeAudio(fileBuffer, async function (responses) {
      let reply = '';
      for (const response of responses) {
        if (response && response.results) {
          for (const result of response.results) {
            if (result && result.alternatives) {
              for (const alt of result.alternatives)
                if (alt && alt.transcript) {
                  console.log(`Agent Response: ${alt.transcript}`);
                  reply += alt.transcript + '. ';
                }
            }
          }
        }
      }

      if (reply.length == 0)
        reply = 'Could not recognize your voice. Make sure your microphone is working.';

      console.log('chat message', reply);
      socket.emit('chat message', reply);

      detectIntentText(socket.id, reply, async function (response) {
        socket.emit('bot message', response);
      });
    });
  });


  ss(socket).on('stream', function (stream, data) {
    // get the name of the stream
    const filename = path.basename(data.name);
    // pipe the filename to the stream
    stream.pipe(fs.createWriteStream(filename));
    // make a detectIntStream call
    detectIntentStream(socket.id, stream, async function (response) {
      if (response.transcript.length == 0)
        socket.emit('chat message', "...");
      else
        socket.emit('chat message', response.transcript);

      if (response.responseMessages) {
        for (const message of response.responseMessages) {
          if (message.text) {
            socket.emit('bot message', message.text.text);
          }
        }
      }
    });
  });

});

module.exports = server;
