import { basekit, FieldType, field, FieldComponent, FieldCode, NumberFormatter, AuthorizationType } from '@lark-opdev/block-basekit-server-api';
import CryptoJS from 'crypto-js';

const { t } = field;

const feishuDm = ['feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com'];
// 通过addDomainList添加请求接口的域名，不可写多个addDomainList，否则会被覆盖
basekit.addDomainList([...feishuDm, 'api.exchangerate-api.com', 'gateway.test.caguuu.cn', 'openapi.caguuu.cn']);

basekit.addField({
  // 定义捷径的i18n语言资源
  i18n: {
    messages: {
      'zh-CN': {
      },
      'en-US': {
      },
      'ja-JP': {
      },
    }
  },
  // 定义捷径的入参
  formItems: [
    {
      key: 'sysPropmt',
      label: '系统提示词',
      component: FieldComponent.Input,
      props: {
        placeholder: '指定AI系统提示词，如：你是一个文生图助手',
      },
      validator: {
        required: false,
      }
    },
    {
      key: 'imgDesc',
      label: '图片描述',
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text],
      },
      validator: {
        required: true,
      }
    },
    {
      key: 'imgAmount',
      label: '生成的图片数量',
      component: FieldComponent.SingleSelect,
      defaultValue: { label: '1', value: 1},
      props: {
        options: [
          { label: '1', value: 1},
          { label: '2', value: 2},
          { label: '3', value: 3}
        ]
      },
      validator: {
        required: true,
      }
    },
    {
      key: 'imgQuality',
      label: '图片质量',
      component: FieldComponent.SingleSelect,
      defaultValue: { label: '中', value: 'MEDIUM'},
      props: {
        options: [
          { label: '高', value: 'HIGH'},
          { label: '中', value: 'MEDIUM'},
          { label: '第', value: 'LOW'}
        ]
      },
      validator: {
        required: true,
      }
    },
    {
      key: 'imgSize',
      label: '图片尺寸',
      component: FieldComponent.SingleSelect,
      defaultValue: { label: '1024x1024', value: '_1024x1024'},
      props: {
        options: [
          { label: '1024x1024', value: '_1024x1024'},
          { label: '1024x1536', value: '_1024x1536'},
          { label: '1536x1024', value: '_1536x1024'}
        ]
      },
      validator: {
        required: true,
      }
    },
    {
      key: 'appKey',
      label: '卡谷Appkey',
      component: FieldComponent.Input,
      props: {
        placeholder: '指定卡谷第三方应用的Appkey',
      },
      validator: {
        required: true,
      }
    },
    {
      key: 'appSecret',
      label: '卡谷AppSecret',
      component: FieldComponent.Input,
      props: {
        placeholder: '指定卡谷第三方应用的AppSecret',
      },
      validator: {
        required: true,
      }
    },
  ],
  // 定义捷径的返回结果类型
  resultType: {
    type: FieldType.Attachment
  },
  // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems （如引用的依赖字段）
  execute: async (formItemParams, context) => {
    const apiServer = 'https://openapi.caguuu.cn';
    const apiPathCreateImageTask = '/aigc/api/content-generation/image-task';
    const apiPathGetImageTaskStatus = '/aigc/api/content-generation/image-task/status';

    function debugLog(arg: any) {
      // @ts-ignore
      console.log(JSON.stringify({
        formItemParams,
        context,
        arg
      }))
    }

    function genApiSignature(method, path, timestampInSeconds, canonicalQuery, body) {
      const bodyStr = normalizeBody(body);
      const payload = [method, path, timestampInSeconds, canonicalQuery, bodyStr].join("&");

      const signature = calculateHmacSha256(formItemParams.appSecret, payload);
      console.log("timestamp:", timestampInSeconds);
      console.log("signature:", signature);
      return signature;
    }

    function getTimestampInSeconds() {
      return Math.floor(Date.now() / 1000).toString();
    }

    function normalizeBody(body) {
      if (!body || body.trim() === "") {
        return "";
      }
      return body.replace(/\s+/g, "");
    }

    function calculateHmacSha256(secret, data) {
      const hash = CryptoJS.HmacSHA256(data, secret);
      return CryptoJS.enc.Hex.stringify(hash);
    }

    /**
     * 获取accessToken
     */
    try {
      const tokenResponse = await context.fetch(`${apiServer}/auth/token?appKey=${formItemParams.appKey}&appSecret=${formItemParams.appSecret}`, {
        method: 'POST',

      }).then(res => res.text());

      const tokenJson = JSON.parse(tokenResponse);
      if (!tokenJson.success) {
        return {
          code: FieldCode.Success,
          data: {
            id: '获取访问token失败，请检查AppKey和AppSecret'
          }
        }
      }

      const accessToken = tokenJson.data.accessToken;

      /**
       * 创建图片生成任务，并轮询获取结果
       */
      const createTaskTimestamp = getTimestampInSeconds();
      const createTaskBody = JSON.stringify({
        "modelName": "gpt-image-1",
        "systemText": formItemParams.sysPropmt,
        "userText": formItemParams.imgDesc[0].text,
        "quality": formItemParams.imgQuality.value,
        "imageSize": formItemParams.imgSize.value,
        "amount": formItemParams.imgAmount.value,
        "shouldRetry": false,
        "async": true
      });
      console.log(createTaskBody);
      const sigCreateTask = genApiSignature("POST", apiPathCreateImageTask, createTaskTimestamp, "", createTaskBody);
      const createImgageTaskUrl = `${apiServer}${apiPathCreateImageTask}`
      const authHeader = `Bearer ${accessToken}`;
      const imgTaskCreateResult: any = await context.fetch(`${apiServer}${apiPathCreateImageTask}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'X-Timestamp': `${createTaskTimestamp}`,
          'X-Signature': sigCreateTask
        },
        body: createTaskBody,
      }).then(res => res.text());
      debugLog({
        '===1 接口返回结果': imgTaskCreateResult
      });
      const imgTaskCreateResultJson = JSON.parse(imgTaskCreateResult);
      const isTaskCreateSucc = imgTaskCreateResultJson?.success;
      if (isTaskCreateSucc) {
        // Wait 3 seconds before polling result
        await new Promise(resolve => setTimeout(resolve, 3000));

        const taskId = imgTaskCreateResultJson.data.taskId;
        const startTime = Date.now();
        const timeout = 3 * 60 * 1000; // 3 minutes in milliseconds

        let imgTaskStatusJson: any;
        let imgTaskStatusSucc = false;

        while (Date.now() - startTime < timeout) {
          const imgTaskStatusGetTimestamp = getTimestampInSeconds();
          const sigImgTaskStatus = genApiSignature("GET", apiPathGetImageTaskStatus, imgTaskStatusGetTimestamp, `taskId=${taskId}`, "");
          const imgTaskStatus: any = await context.fetch(`${apiServer}${apiPathGetImageTaskStatus}?taskId=${taskId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'X-Timestamp': imgTaskStatusGetTimestamp,
              'X-Signature': sigImgTaskStatus
            }
          }).then(res => res.text());

          debugLog({
            '===2 轮询状态结果': imgTaskStatus
          });

          imgTaskStatusJson = JSON.parse(imgTaskStatus);
          imgTaskStatusSucc = imgTaskStatusJson?.success;

          if (imgTaskStatusSucc && imgTaskStatusJson.data?.status !== 'DOING') {
            if (imgTaskStatusJson.data?.status === 'SUCC') {
              // 任务成功完成，获取生成的图片链接
              const imageUrls = imgTaskStatusJson.data.imageUrls;
              debugLog({
                '===3 任务完成，图片链接': imageUrls
              });

              // 将图片链接转换为返回格式
              const attachments = imageUrls.map((url: string, index: number) => {
                const urlParts = url.split('/');
                const filename = urlParts[urlParts.length - 1] || `generated_image_${index + 1}.png`;
                return {
                  name: filename,
                  content: url,
                  contentType: "attachment/url"
                };
              });
              return {
                code: FieldCode.Success,
                data: attachments
              };
            }
            break;
          }

          // Wait 3 seconds before next poll
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Check if timeout occurred
        if (Date.now() - startTime >= timeout) {
          debugLog({
            '===timeout': '任务超时，等待时间超过3分钟'
          });
        }
      }
      console.log("=========after suceess=========");
      return {
        code: FieldCode.Success,
        data: {
          id: '生成图片未成功，请重试'
        }
      }

    } catch (e) {
      console.log("=========in exception=========");

      debugLog({
        '===999 异常错误': String(e)
      });

      return {
        code: FieldCode.Error,
      }
    }
  },
});
export default basekit;
