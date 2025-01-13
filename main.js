$(function () {
    const { InferenceEngine, CVImage } = inferencejs;
    const inferEngine = new InferenceEngine();
    let workerId;

    // Configuración de ROS
    const ros = new ROSLIB.Ros({
        url: "ws://zombieduck.local:9001" // Cambia esto según la dirección WebSocket de tu Duckiebot
    });

    ros.on("connection", () => console.log("Conectado a ROS"));
    ros.on("error", (error) => console.error("Error en ROS:", error));
    ros.on("close", () => console.warn("Conexión a ROS cerrada"));

    // Suscripción al tópico de la cámara
    const cameraTopic = new ROSLIB.Topic({
        ros,
        name: "/zombieduck/camera_node/image/compressed", // Tópico de la cámara del Duckiebot
        messageType: "sensor_msgs/CompressedImage",
    });

    // Inicializar el motor de inferencia
    const loadModelPromise = new Promise((resolve, reject) => {
        inferEngine
            .startWorker("obj_det_duckietown-m0vdj", "3", "rf_Jy6MyK2DjSSWGvJXrK45cOzXext1")
            .then((id) => {
                workerId = id;
                console.log("Modelo cargado. Worker ID:", workerId);
                resolve();
            })
            .catch((error) => {
                console.error("Error al cargar el modelo:", error);
                reject(error);
            });
    });

    let canvas, ctx;
    const font = "16px sans-serif";
    let previousObjectCount = 0;

    const setupCanvas = () => {
        canvas = $("<canvas/>")[0];
        ctx = canvas.getContext("2d");
        $("body").append(canvas);
    };

    const resizeCanvas = (width, height) => {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
    };

    const renderPredictions = (predictions) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Mostrar la cantidad de objetos detectados
        const objectCount = predictions.length;
        $("#object-count").text(`Objetos detectados: ${objectCount}`);

        predictions.forEach(({ bbox, class: label, color }) => {
            const { x, y, width, height } = bbox;

            // Dibujar la caja delimitadora
            ctx.strokeStyle = color || "#FF0000"; // Color predeterminado: rojo
            ctx.lineWidth = 4;
            ctx.strokeRect(
                (x - width / 2),
                (y - height / 2),
                width,
                height
            );

            // Dibujar un punto en el centro del objeto
            ctx.fillStyle = color || "#00FF00"; // Color del punto: verde
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI); // Radio del punto: 5px
            ctx.fill();

            // Dibujar la etiqueta
            ctx.fillStyle = color || "#000000"; // Fondo de etiqueta
            const textWidth = ctx.measureText(label).width;
            const textHeight = parseInt(font, 10);
            ctx.fillRect(
                (x - width / 2),
                (y - height / 2) - textHeight - 4,
                textWidth + 8,
                textHeight + 4
            );

            ctx.fillStyle = "#FFFFFF"; // Color del texto: blanco
            ctx.font = font;
            ctx.fillText(
                label,
                (x - width / 2) + 4,
                (y - height / 2) - textHeight - 4
            );
        });
    };

    const processInference = (cvImage) => {
        inferEngine
            .infer(workerId, cvImage)
            .then((predictions) => {
                renderPredictions(predictions);

                // Actualiza si el número de objetos cambia
                const currentObjectCount = predictions.length;
                if (currentObjectCount !== previousObjectCount) {
                    console.log(
                        `Cambio detectado: ${currentObjectCount} objetos detectados (anterior: ${previousObjectCount})`
                    );
                    previousObjectCount = currentObjectCount;
                }
            })
            .catch((error) => console.error("Error durante la inferencia:", error));
    };

    const processFrame = (imageMessage) => {
        const image = new Image();
        image.src = "data:image/jpeg;base64," + imageMessage.data;

        image.onload = () => {
            resizeCanvas(image.width, image.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            const cvImage = new CVImage(image);
            processInference(cvImage); // Procesa el cuadro dinámicamente
        };
    };

    // Inicializar todo
    Promise.all([loadModelPromise])
        .then(() => {
            $("body").removeClass("loading");
            setupCanvas();
            cameraTopic.subscribe(processFrame); // Procesa cada cuadro recibido
        })
        .catch((error) => console.error("Error inicializando:", error));
});
