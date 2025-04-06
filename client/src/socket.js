// socket.js
import {io} from 'socket.io-client';
import Cookies from 'js-cookie';

// Don't create a global socket instance
// Instead, use a function to create properly authenticated sockets
const createSocket = () => {
  const userName = Cookies.get('userName') || sessionStorage.getItem('userName') || 'Anonymous';
  
  return io("http://localhost:3000", {
    withCredentials: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: false,
    auth: {
      userName
    }
  });
};

export default createSocket;