const { Event } = require('klasa');

module.exports = class extends Event {

	async run() {
		await this.client.audioManager.init();
		this.client.console.log(['Audio Manager ready.'], 'thread');
	}


};
