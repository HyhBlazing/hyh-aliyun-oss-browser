/** 将 OSS / 网络错误转为中文提示，避免直接暴露底层异常 */
export function chineseErr(err) {
  if (!err) return "操作失败";
  const code = String(err.code || "");
  const msg = String(err.message || "");

  const byCode = {
    AccessDenied: "没有权限执行该操作",
    AccessDeniedError: "没有权限执行该操作",
    InvalidAccessKeyId: "AccessKeyId 无效",
    SignatureDoesNotMatch: "AccessKeySecret 不正确",
    NoSuchBucket: "Bucket 不存在，或 Endpoint/Region 不正确",
    NoSuchKey: "对象不存在",
    BucketAlreadyExists: "Bucket 名称已被占用",
    BucketNotEmpty: "Bucket 不为空，无法删除",
    EntityTooLarge: "对象过大",
    InvalidBucketName: "Bucket 名称不合法",
    InvalidObjectName: "对象名称不合法",
    RequestTimeout: "请求超时，请稍后重试",
    ConnectionTimeoutError: "连接超时，请检查网络或 Endpoint",
    RequestError: "网络请求失败，请检查网络",
    PermanentRedirect: "Endpoint 与 Bucket 区域不匹配，请使用正确区域访问",
    SecondLevelDomainForbidden: "请使用 Bucket 所在区域的 Endpoint 访问",
    SecurityTokenExpired: "STS Token 已过期，请重新登录",
    InvalidSecurityToken: "STS Token 无效",
    PositionNotEqualToLength: "追加上传位置不匹配",
    FileAlreadyExists: "文件已存在",
    TooManyBuckets: "Bucket 数量已达上限",
  };

  if (byCode[code]) return byCode[code];

  if (/must be addressed using the specified endpoint/i.test(msg)) {
    return "Endpoint 与 Bucket 区域不匹配，请使用正确区域访问";
  }
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
    return "无法解析域名，请检查 Endpoint 或网络";
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return "连接被拒绝，请检查网络或服务地址";
  }
  if (/certificate|SSL|TLS/i.test(msg)) {
    return "证书校验失败，可在设置中临时允许不安全 TLS（仅调试）";
  }
  if (/timeout/i.test(msg)) {
    return "请求超时，请稍后重试";
  }

  // 已是中文则直接返回
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;

  if (code && !/^OSS/.test(code)) {
    return `操作失败（${code}）`;
  }
  return "操作失败，请稍后重试";
}
