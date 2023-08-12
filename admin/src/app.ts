import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import { dataSource } from './utils/mysql_connector';
import { Product } from './entity/product';
import { Product as ProductType } from './interfaces/product';
import amqp from 'amqplib';

(async () => {
  const app: Application = express();

  const port = process.env.port || 3000;
  const queueCreated = 'product_created';
  const queueUpdated = 'product_updated';
  const queueDeleted = 'product_deleted';
  const queueLiked = 'product_liked';

  try {

    // connec to Rabbitmq
    const connection = await amqp.connect('amqp://localhost');

    const channel = await connection.createChannel();

    console.log('RabbitMQ channel created!');

    await Promise.all([
      channel.assertQueue(queueCreated),
      channel.assertQueue(queueUpdated),
      channel.assertQueue(queueDeleted),
      channel.assertQueue(queueLiked),
    ]);

    // connec to Mysql
    const db = await dataSource.initialize();
    console.log('Data Source has been initialized!');

    const productRepository = db.getRepository(Product);

    app.use(cors({
      origin: ['http://localhost:4000'],
    }));
    
    app.use(express.json());

    // routes
    app.get('/api/products', async (req: Request, res: Response) => {
      const products = await productRepository.find();

      res.json(products);
    });

    app.post('/api/products', async (req: Request, res: Response) => {
      const product = productRepository.create(req.body);

      const result = await productRepository.save(product);

      // send product infor to queue
      channel.sendToQueue(queueCreated, Buffer.from(JSON.stringify(result)));

      res.json(result);
    });

    app.get('/api/products/:id', async (req: Request, res: Response) => {
      const product = await productRepository.findOneBy({ id: parseInt(req.params.id) });

      res.json(product);
    });

    app.put('/api/products/:id', async (req: Request, res: Response) => {
      const product: any = await productRepository.findOneBy({ id: parseInt(req.params.id) });

      productRepository.merge(product, req.body);

      const result = await productRepository.save(product);

      // send product infor to queue
      channel.sendToQueue(queueUpdated, Buffer.from(JSON.stringify(result)));

      res.json(result);
    });

    // queue consumes
    channel.consume(queueLiked, async (msg) => {
      if (msg) {
        const incomingProduct = JSON.parse(msg.content.toString());

        const product = await productRepository.findOneBy({ id: incomingProduct.product_id });

        if (product) {
          product.likes = incomingProduct.likes;

          await productRepository.save(product);

          console.log('Product like saved');
        }
      }
    }, { noAck: true })

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
