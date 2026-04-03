$envs = @{
    "VITE_FIREBASE_AUTH_DOMAIN" = "cedar-risk-compliance-suite.firebaseapp.com"
    "VITE_FIREBASE_PROJECT_ID" = "cedar-risk-compliance-suite"
    "VITE_FIREBASE_STORAGE_BUCKET" = "cedar-risk-compliance-suite.firebasestorage.app"
    "VITE_FIREBASE_MESSAGING_SENDER_ID" = "63265176715"
    "VITE_FIREBASE_APP_ID" = "1:63265176715:web:a17405dcbb8280f917a88e"
    "VITE_API_URL" = "/api"
    "GEMINI_API_KEY" = "AIzaSyCHFp8X0hMfbLdDzqRZaDmSkHLD9O8XwPY"
}

foreach ($key in $envs.Keys) {
    echo $envs[$key] | npx vercel env add $key production
}
