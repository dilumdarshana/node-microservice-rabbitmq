import express, { Request, Response } from 'express';
import cors from 'cors';
import { Product } from './entities/product';
import { dataSource } from './utils/mongo_connector';
import amqp from 'amqplib';

(async () => {
  const app = express();

  const port = process.env.port || 5000;
  const queue_created = 'product_created';
  const queue_updated = 'product_updated';
  const queue_deleted = 'product_deleted';
  const queue_liked = 'product_liked';
  
  try {
    // connec to Rabbitmq
    const connection = await amqp.connect('amqp://localhost');

    const channel = await connection.createChannel();

    console.log('RabbitMQ channel created!');

    await Promise.all([
      channel.assertQueue(queue_created),
      channel.assertQueue(queue_updated),
      channel.assertQueue(queue_deleted)
    ]);

    // connec to Mongodb
    const db = await dataSource.initialize();
    console.log('Data Source has been initialized!');

    const productRepository = db.getRepository(Product);

    app.use(cors({
      origin: ['http://localhost:6000'],
    }));
    
    app.use(express.json());

    // RabbitMQ consumers
    channel.consume(queue_created, async (msg) => {
      if (msg) {
        const { content } = msg;
        const incomingProduct: Product = JSON.parse(content.toString());

        const product = new Product();
        product.admin_id = parseInt(incomingProduct.id);
        product.title = incomingProduct.title;
        product.image = incomingProduct.image;
        product.likes = incomingProduct.likes;

        await productRepository.save(product);

        console.log('Prouct created');
      }
    }, { noAck: true });

    channel.consume(queue_updated, async (msg) => {
      if (msg) {
        const { content } = msg;
        const incomingProduct: Product = JSON.parse(content.toString());

        const existingProduct = await productRepository.findOneBy({ admin_id: parseInt(incomingProduct.id) })

        if (existingProduct) {
          productRepository.merge(existingProduct, {
            title: incomingProduct.title,
            image: incomingProduct.image,
            likes: incomingProduct.likes,
          });

          await productRepository.save(existingProduct);

          console.log('Prouct updated');
        }
      }
    }, { noAck: true });

    // routes
    app.get('/api/products', async (req: Request, res: Response) => {
      const products = await productRepository.find();

      res.json(products);
    });

    app.put('/api/product/:id/like', async (req: Request, res: Response) => {
      const product: any = await productRepository.findOneBy({ admin_id: parseInt(req.params.id) });

      product.likes++;

      // send like to queue
      channel.sendToQueue(queue_liked, Buffer.from(JSON.stringify({ product_id: req.params.id, likes: product.likes })));

      const result = await productRepository.save(product);

      res.json(result);
    });

    // create server
    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });

    // close RabbitMQ connection
    process.on('beforeExit', () => {
      console.log('Closing RabbitMQ connection')
      connection.close();
    });
  } catch (err) {
    console.error('Error during server initialization', err)
  }
})();
