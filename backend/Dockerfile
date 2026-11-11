# Lambda container image (pandas + scikit-learn exceed the zip size limit)
FROM public.ecr.aws/lambda/python:3.12
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ${LAMBDA_TASK_ROOT}/app
CMD ["app.main.handler"]
