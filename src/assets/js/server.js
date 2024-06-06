const express = require('express');
const app = express();
const port = 3030;

app.get('/auth/discord', (req, res) => {
    const token = req.query.access_token;
    if (token) {
        res.send(`<script>
            window.opener.postMessage({ token: '${token}' }, '*');
            window.close();
        </script>`);
    } else {
        res.send('Error: Token no recibido');
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});