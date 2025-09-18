'use strict'

//-------------

require('dotenv').config();

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();
require('express-ws')(app);

app.use(bodyParser.json());

const webSocket = require('ws');

//--

const axios = require('axios');

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//---

// ONLY if needed - For self-signed certificate in chain - In test environment
// Must leave next line as a comment in production environment
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

//---- DeepGram ASR engine ----

const dgApiKey = process.env.DEEPGRAM_API_KEY;
const dgWsListenEndpoint = process.env.DEEPGRAM_WS_LISTEN_ENDPOINT_URL;
const dgDiarize = process.env.DEEPGRAM_ASR_DIARIZE == "true" ? true : false;

//--- Websocket server (for WebSockets from Vonage Voice API platform)- Deepgram transcribe live streaming audio ---

app.ws('/socket', async (ws, req) => {

  let dgJwt = null;

  try { 
    
    const response = await axios.post('https://api.deepgram.com/v1/auth/grant',
      {
      },
      {
        headers: {
          "Authorization": 'Token ' + dgApiKey,
        }
      }
    );

    // console.log('reponse:', response)
    
    dgJwt = response.data.access_token;
    // console.log('dgJwt:', dgJwt);
  
  } catch (error) {
    
    console.log('\n>>> Failed to get a Deepgram JWT:', error);
  
  }

  const peerUuid = req.query.peer_uuid;
  const webhookUrl = req.query.webhook_url;
  const user = req.query.user;
  const remoteParty = req.query.remote_party;

  //--

  let dgSessionDiarize;

  if (req.query.diarize == "true") {
    dgSessionDiarize = true;          // ability to override to true on a per session basis (per incoming WebSocket)
  } else {
    dgSessionDiarize = dgDiarize;
  }

  //--

  let dgSessionLanguageCode = 'en-US'; // default BCP-47 language code

  if (req.query.language_code) {
    dgSessionLanguageCode = req.query.language_code;
  }

  //--

  let dgWsOpen = false;

  //--

  console.log('>>> websocket connected with');
  console.log('peer call uuid:', peerUuid);

  //--

  console.log('Creating WebSocket connection to DeepGram');

  const wsDGUri = dgWsListenEndpoint + '?callback=' + webhookUrl + 
  '&diarize=' + dgSessionDiarize + '&encoding=linear16&sample_rate=16000' + 
  '&language=' + dgSessionLanguageCode + '&model=nova-2' + '&punctuate=true' + 
  '&extra=peer_uuid:' + peerUuid + '&extra=language_code:' + dgSessionLanguageCode; 
 
  console.log('Deepgram WebSocket URI:', wsDGUri);

  const wsDG = new webSocket("wss://" + wsDGUri, {
    // "headers": {"Authorization": "Token " + dgApiKey}
    "headers": {"Authorization": "Bearer " + dgJwt}
  });

  //--

  wsDG.on('error', async (event) => {

    console.log('WebSocket to Deepgram error:', event);

  });  

  //-- 

  wsDG.on('open', () => {
      console.log('WebSocket to Deepgram opened');
      dgWsOpen = true;
  });

  //--

  wsDG.on('message', async(msg, isBinary) =>  {

    // const response = JSON.parse(msg);
    // console.log("\n", response);

    console.log("\nReceived Deegpram data:", msg);
    console.log("\nReceived Deegpram data is binary:", isBinary);

  });

  //--

  wsDG.on('close', async () => {

    dgWsOpen = false; // stop sending audio payload to Deepgram platform
    
    console.log("Deepgram WebSocket closed");
  });


  //---------------

  ws.on('message', async (msg) => {
    
    if (typeof msg === "string") {
    
      console.log("\n>>> Websocket text message:", msg);
    
    } else {

      if (dgWsOpen) {
        wsDG.send(msg);
      }  

    }

  });

  //--

  ws.on('close', async () => {

    dgWsOpen = false;

    wsDG.close();
    
    console.log("Vonage WebSocket closed");
  });

});

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 6000;

app.listen(port, () => console.log(`Connector application listening on port ${port}!`));

//------------

