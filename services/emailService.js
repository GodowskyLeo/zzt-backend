const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com', // Use Hostinger's standard SMTP server
    port: 465, // Standard secure port
    secure: true,
    auth: {
        user: 'notification@barometrnastrojow.com',
        pass: '96M78KMHSXtRBsT!'
    }
});

// Verify connection
transporter.verify(function (error, success) {
    if (error) {
        console.error('Email Server Error:', error);
    } else {
        console.log('Email Server is ready to take our messages');
    }
});

const sendVerificationEmail = async (email, code) => {
    try {
        await transporter.sendMail({
            from: '"Barometr Nastrojów" <notification@barometrnastrojow.com>',
            to: email,
            subject: 'Weryfikacja konta - Barometr Nastrojów',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Witaj!</h2>
                    <p>Twój kod weryfikacyjny to:</p>
                    <h1 style="color: #0d9488; letter-spacing: 5px;">${code}</h1>
                    <p>Wpisz go w aplikacji, aby dokończyć rejestrację.</p>
                    <p>Kod jest ważny przez 24 godziny.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error('Send verification email error:', error);
        return false;
    }
};

const sendBanNotification = async (email, reason) => {
    try {
        await transporter.sendMail({
            from: '"Barometr Nastrojów" <notification@barometrnastrojow.com>',
            to: email,
            subject: 'Powiadomienie o blokadzie konta',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #ef4444;">Twoje konto zostało zablokowane</h2>
                    <p>Witaj,</p>
                    <p>Twoje konto w serwisie Barometr Nastrojów zostało zablokowane z powodu naruszenia regulaminu.</p>
                    <p><strong>Powód blokady:</strong> ${reason || 'Naruszenie zasad społeczności'}</p>
                    <p>Jeśli uważasz, że to pomyłka, skontaktuj się z nami pod adresem <a href="mailto:abuse@barometrnastrojow.com">abuse@barometrnastrojow.com</a>.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error('Send ban notification error:', error);
        return false;
    }
};

const sendGroupInviteEmail = async (email, code, groupName) => {
    try {
        await transporter.sendMail({
            from: '"Barometr Nastrojów" <notification@barometrnastrojow.com>',
            to: email,
            subject: `Zaproszenie do grupy ${groupName} - Barometr Nastrojów`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Zostałeś zaproszony!</h2>
                    <p>Użytkownik zaprosił Cię do dołączenia do grupy <strong>${groupName}</strong>.</p>
                    <p>Aby dołączyć, użyj poniższego kodu w aplikacji:</p>
                    <h1 style="color: #0d9488; letter-spacing: 5px;">${code}</h1>
                    <p>Lub kliknij w ten link: <a href="https://barometrnastrojow.com/join/${code}">Dołącz teraz</a></p>
                    <p>Zaproszenie jest ważne przez 7 dni.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error('Send invite email error:', error);
        return false;
    }
};

module.exports = { sendVerificationEmail, sendBanNotification, sendGroupInviteEmail };
