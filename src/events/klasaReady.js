const { Event } = require('klasa');

module.exports = class extends Event {

	constructor(...args) {
		super(...args, { once: true });
	}

	async run() {
		await this.client.audioManager.init();
		this.client.console.write([`Audio Manager ready in ${process.uptime()}.`], 'thread');
	}


};
