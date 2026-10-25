// Socket.IO singleton — lets controllers emit events without circular imports
let _io = null;

export const setIo = (io) => {
  _io = io;
};

export const getIo = () => _io;
