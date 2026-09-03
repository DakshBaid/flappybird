// Include this script in your game to push scores.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Tech Unleash Central Database Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCTYSpFpYYL7pS1ce64Y7Tj_sR2tHzkGRc",
    authDomain: "tech-unleash-board.firebaseapp.com",
    projectId: "tech-unleash-board",
    storageBucket: "tech-unleash-board.firebasestorage.app",
    messagingSenderId: "270790018116",
    appId: "1:270790018116:web:76b21ed0335a79ae5d6811"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// The Secret Password for the Event
const EVENT_SECRET = "GameOn2026!"; // Change this for each event to prevent cheating

// Updated Logic with Anti-Cheat Password
export async function submitScore(playerName, gameName, newScore, secretKey) {
    
    // 🛡️ SECURITY LAYER 1: Check Password
    if (secretKey !== EVENT_SECRET) {
        console.error("❌ [SECURITY ALERT] Unauthorized score submission blocked! Invalid Key.");
        return; // Reject the request instantly
    }

    try {
        const playerRef = doc(db, "players", playerName);
        const docSnap = await getDoc(playerRef);

        if (docSnap.exists()) {
            let data = docSnap.data();
            let allGamesPlayed = data.gameScores || {}; 

            // Rule: First Attempt Only 
            if (allGamesPlayed[gameName] !== undefined) {
                console.log(`❌ [IGNORED] ${playerName} already played ${gameName}.`);
                return; 
            }

            // New Game, calculate new total
            allGamesPlayed[gameName] = newScore;
            let freshTotal = 0;
            for (let game in allGamesPlayed) {
                freshTotal += allGamesPlayed[game];
            }

            await setDoc(playerRef, {
                totalScore: freshTotal,
                gameScores: allGamesPlayed
            }, { merge: true }); 
            
            console.log(`✅ [SUCCESS] Score added! New Total: ${freshTotal}`);

        } else {
            // First time playing ANY game
            await setDoc(playerRef, {
                playerName: playerName,
                totalScore: newScore,
                gameScores: {
                    [gameName]: newScore
                },
                timestamp: new Date()
            });
            console.log(`✅ [SUCCESS] New profile created! First score saved.`);
        }
    } catch (error) {
        console.error("Error saving score:", error);
    }
}