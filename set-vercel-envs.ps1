$env:vars = @{
    "VITE_FIREBASE_API_KEY"             = "AIzaSyCDV1FvrJe3hW1VQoyUFb8yh1TRAV1T6OQ"
    "VITE_FIREBASE_AUTH_DOMAIN"         = "cedar-risk-compliance-suite.firebaseapp.com"
    "VITE_FIREBASE_PROJECT_ID"          = "cedar-risk-compliance-suite"
    "VITE_FIREBASE_STORAGE_BUCKET"      = "cedar-risk-compliance-suite.firebasestorage.app"
    "VITE_FIREBASE_MESSAGING_SENDER_ID" = "63265176715"
    "VITE_FIREBASE_APP_ID"              = "1:63265176715:web:a17405dcbb8280f917a88e"
    "VITE_API_URL"                      = "/api"
    "GEMINI_API_KEY"                    = "AIzaSyCHFp8X0hMfbLdDzqRZaDmSkHLD9O8XwPY"
    "FIREBASE_SERVICE_ACCOUNT"          = (Get-Content "cedar-risk-compliance-suite-firebase-adminsdk-fbsvc-44202d9248.json" -Raw)
}

foreach ($key in $env:vars.Keys) {
    $value = $env:vars[$key]
    # Remove the existing env var first (ignore errors if it doesn't exist)
    npx vercel env rm $key production -y 2>$null
    # Add env var by writing value to a temp file and using stdin redirection to avoid newlines
    $tmpFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmpFile, $value)
    Get-Content $tmpFile -Raw | npx vercel env add $key production
    Remove-Item $tmpFile
    Write-Host "Set $key"
}
