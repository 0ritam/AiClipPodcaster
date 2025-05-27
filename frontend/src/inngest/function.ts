import { env } from "~/env";
import { inngest } from "./client";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { ListObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { responseCookiesToRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  { event: "process-video-events" },
  async ({ event, step }) => {
    const { uploadedFileId } = event.data;

    const { userId, credits, s3key } = await step.run(
      "check-credits",
      async () => {
        const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
          where: {
            id: uploadedFileId,
          },
          select: {
            user: {
              select: {
                id: true,
                credits: true,
              },
            },
            s3Key: true,
          },
        });

        return {
          userId: uploadedFile.user.id,
          credits: uploadedFile.user.credits,
          s3key: uploadedFile.s3Key,
        };
      },
    );

    if (credits > 0) {
      await step.run("set-status-process", async () => {
        await db.uploadedFile.update({
          where: {
            id: uploadedFileId,
          },
          data: {
            status: "processing",
          },
        });
      });

      await step.run("call-modal-endpoint", async () => {
        await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({ s3_key: s3key }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
          },
        });
      });


      await step.run("call-modal-endpoint", async () => {
      await fetch(env.PROCESS_VIDEO_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ s3_key: "test1/rimed7.mp4" }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
        },
      });
    });

    const {clipsFound} = await step.run("create-clips-in-db", async () => {
        const folderPrefix = s3key.split("/")[0]!;

        const allKeys = await listS3ObjectsByPrefix(folderPrefix);

        const clipKeys = allKeys.filter(
            (key): key is string =>
                key !== undefined && !key.endsWith("original.mp4"),
        );

        if (clipKeys.length > 0) {
            await db.clip.createMany({
                data: clipKeys.map((clipKey) => ({
                    s3key: clipKey,
                    uploadedFileId,
                    userId,
                }))
            })
        }

        return {clipsFound: clipKeys.length}
    })

    await step.run("deduct-credits", async () => {
          await db.user.update({
            where: {
              id: userId,
            },
            data: {
              credits: {
                decrement: Math.min(credits, clipsFound),
              },
            },
          });
        });

        await step.run("set-status-processed", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "processed",
            },
          });
        });
    } else {
        await step.run("set-status-no-credits", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "no credits",
            },
          });
        });
      } 
  },
);

async function listS3ObjectsByPrefix(prefix: string){
    const s3Client = new S3Client({region: env.AWS_REGION, credentials:{
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }
})

    const listCommand = new ListObjectsCommand({
        Bucket: env.S3_BUCKET_NAME,
        Prefix: prefix
    })

    const response = await s3Client.send(listCommand);
    return response.Contents?.map((item) => item.Key).filter(Boolean) || []
}
