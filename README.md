# LAVAZA CAR · Reservas + Stripe + emails

Flujo:
Meta → reserva → centro → fecha → hora → datos → Stripe → pago confirmado → reserva → emails → calendario.

Emails:
1. El cliente recibe confirmación.
2. LAVAZA CAR recibe aviso de nueva reserva.

Para activar emails:
- Configura SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD.
- Configura LAVAZA_NOTIFICATION_EMAIL.
- Nunca pongas credenciales secretas en el frontend.


Render: Build Command = npm install. Start Command = npm start.
Environment variables: PUBLIC_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, LAVAZA_NOTIFICATION_EMAIL.
