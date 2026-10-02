import express from "express";
import dotenv from "dotenv";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import crypto from "node:crypto";

dotenv.config();
const app=express();
const stripe=process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const reservations=new Map();
const blocked=new Set();

const publicUrl=(process.env.PUBLIC_URL||"http://localhost:3000").replace(/\/$/,"");

const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
  : null;

async function sendConfirmationEmails(m) {
  if (!mailer || !process.env.LAVAZA_NOTIFICATION_EMAIL) return;

  const centerName = m.center === "las_rozas" ? "Las Rozas" : "Alcalá de Henares";
  const subject = `Reserva confirmada · LAVAZA CAR · ${centerName} · ${m.date} ${m.time}`;

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>LAVAZA CAR</h2>
      <h3>Reserva confirmada</h3>
      <p>Hola ${m.name},</p>
      <p>Tu reserva ha quedado confirmada y el pago de <b>45 €</b> se ha realizado correctamente.</p>
      <p><b>Centro:</b> ${centerName}<br>
      <b>Fecha:</b> ${m.date}<br>
      <b>Hora:</b> ${m.time}<br>
      <b>Servicio:</b> Limpieza de tapicería<br>
      <b>Matrícula:</b> ${m.plate}</p>
      <p>Te esperamos en LAVAZA CAR.</p>
    </div>`;

  const internalHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>NUEVA RESERVA · LAVAZA CAR</h2>
      <p><b>Centro:</b> ${centerName}<br>
      <b>Fecha:</b> ${m.date}<br>
      <b>Hora:</b> ${m.time}<br>
      <b>Servicio:</b> Limpieza de tapicería<br>
      <b>Importe:</b> 45 €</p>
      <hr>
      <p><b>Cliente:</b> ${m.name}<br>
      <b>Teléfono:</b> ${m.phone}<br>
      <b>Email:</b> ${m.email}<br>
      <b>Matrícula:</b> ${m.plate}</p>
    </div>`;

  await Promise.all([
    mailer.sendMail({
      from: process.env.SMTP_USER,
      to: m.email,
      subject,
      html: customerHtml
    }),
    mailer.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.LAVAZA_NOTIFICATION_EMAIL,
      subject: `NUEVA RESERVA · ${centerName} · ${m.date} ${m.time}`,
      html: internalHtml
    })
  ]);
}

const SCHEDULE={
  1:["10:00","11:00","12:00","13:00","16:00","17:00","18:00"],
  2:["10:00","11:00","12:00","13:00","16:00","17:00","18:00"],
  3:["10:00","11:00","12:00","13:00","16:00","17:00","18:00"],
  4:["10:00","11:00","12:00","13:00","16:00","17:00","18:00"],
  5:["10:00","11:00","12:00","13:00","15:30","16:30","17:30","18:30"]
};

app.get("/api/availability",(req,res)=>{
  const {center,date}=req.query;
  const weekday=new Date(date+"T12:00:00").getDay();
  const times=SCHEDULE[weekday]||[];
  res.json(times.map(time=>{
    const key=`${center}|${date}|${time}`;
    return {time,status:(reservations.has(key)||blocked.has(key))?"busy":"available"};
  }));
});

app.post("/api/create-checkout",express.json(),async(req,res)=>{
  const {center,date,time,name,phone,email,plate}=req.body;
  if(!center||!date||!time||!name||!phone||!email||!plate)
    return res.status(400).json({error:"Faltan datos."});

  const key=`${center}|${date}|${time}`;
  if(reservations.has(key)||blocked.has(key))
    return res.status(409).json({error:"Esa hora ya no está disponible."});

  if(!stripe) return res.status(503).json({error:"Stripe aún no está configurado."});

  const session=await stripe.checkout.sessions.create({
    mode:"payment",
    customer_email:email,
    line_items:[{
      price_data:{
        currency:"eur",
        product_data:{name:"Limpieza de tapicería · LAVAZA CAR"},
        unit_amount:4500
      },
      quantity:1
    }],
    metadata:{center,date,time,name,phone,email,plate,key},
    success_url:`${publicUrl}/confirmacion.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${publicUrl}/?cancelado=1`,
    expires_at:Math.floor(Date.now()/1000)+1800
  });
  res.json({url:session.url});
});

app.post("/api/webhook",express.raw({type:"application/json"}),(req,res)=>{
  if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET)return res.sendStatus(200);
  let event;
  try{event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET)}
  catch(e){return res.status(400).send("Webhook error")}
  if(event.type==="checkout.session.completed"){
    const s=event.data.object,m=s.metadata;
    reservations.set(m.key,{...m,payment:"paid",stripe_session:s.id});
    sendConfirmationEmails(m).catch(err=>console.error("Error enviando emails:",err));
  }
  res.sendStatus(200);
});

app.use(express.json());
app.use(express.static("public"));

app.post("/api/admin/block",(req,res)=>{
  const {center,date,time}=req.body;
  blocked.add(`${center}|${date}|${time}`);
  res.json({ok:true});
});
app.post("/api/admin/unblock",(req,res)=>{
  const {center,date,time}=req.body;
  blocked.delete(`${center}|${date}|${time}`);
  res.json({ok:true});
});

app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("LAVAZA Stripe activo"));
