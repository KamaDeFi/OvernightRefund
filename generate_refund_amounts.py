import collections
import csv

usd_holdings_per_address = collections.defaultdict(int)

with open('usd_plus_holders_block_22720066.csv', mode='r') as csvfile:
    csv_reader = csv.DictReader(csvfile, delimiter=',')
    for row in csv_reader:
        usd_holdings_per_address[row['Address']] = int(row['Amount'])

with open('all_usd_plus_transactions.csv', mode='r') as csvfile:
    csv_reader = csv.DictReader(csvfile, delimiter=',')
    for row in csv_reader:
        usd_holdings_per_address[row['From Address']] += int(row['From Address Dollar Value Change'])
        usd_holdings_per_address[row['To Address']] += int(row['To Address Dollar Value Change'])

with open('user_usd_plus_in_lps_22742224.csv', mode='r') as csvfile:
    csv_reader = csv.DictReader(csvfile, delimiter=',')
    for row in csv_reader:
        usd_holdings_per_address[row['Holder']] += int(row['Amount'])

with open('usd_plus_holders_block_22742225.csv', mode='r') as csvfile:
    csv_reader = csv.DictReader(csvfile, delimiter=',')
    for row in csv_reader:
        usd_holdings_per_address[row['Address']] -= int(row['Amount'])

with open('user_usd_plus_in_lps_22742225.csv', mode='r') as csvfile:
    csv_reader = csv.DictReader(csvfile, delimiter=',')
    for row in csv_reader:
        usd_holdings_per_address[row['Holder']] -= int(row['Amount'])

total = 0
with open('refund.csv', mode='w') as csvfile:
    csv_writer = csv.writer(csvfile, delimiter=',')
    csv_writer.writerow(['Address', 'Amount'])
    for address, amount in usd_holdings_per_address.items():
        csv_writer.writerow([address, '$' + str(round(float(amount) / 10**18, 2))])
        total += round(float(amount) / 10**18, 2)
print('Total refund is $' + str(total))
