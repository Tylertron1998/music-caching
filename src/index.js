const { Client } = require('klasa');
const { config, token } = require('./config');
const AudioManager = require('./classes/AudioManager');

class MyKlasaClient extends Client {

	constructor(...args) {
		super(...args);

		this.audioManager = new AudioManager(this, 2, 2, true);
	}

}

new MyKlasaClient(config).login(token);
