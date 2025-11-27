import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBrgo_g9bAVaqLF2DSmJ33nXMSY9z4RVQ8",  
  authDomain: "kalenaweb.firebaseapp.com",
  projectId: "kalenaweb",
  storageBucket: "kalenaweb.appspot.com",
  messagingSenderId: "106850260372",
  appId: "1:106850260372:web:0b10574213380e4cbdab81"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
