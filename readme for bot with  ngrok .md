/////// install on vps ///////

winget install ngrok.ngrok
ngrok update
ngrok update

Alternatively, you can reinstall or update it via winget:
winget upgrade ngrok.ngrok

/////// start port for other devices ////////

ngrok http 3000 --authtoken  <your-authtoken-of0ngrok>

-----OR--------

ngrok http 3000 --config NUL <your-authtoken-of0ngrok>
