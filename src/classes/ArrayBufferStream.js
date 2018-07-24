const { Readable } = require('stream');

class ArrayBufferStream extends Readable {

	constructor(files) {
		super();
		this.files = files;
	}


	_read() {
		return this.push(this.files.shift());
	}

}

module.exports = ArrayBufferStream;
