$provisioningScript = <<SCRIPT

sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:nginx/stable
sudo apt-get -y update

if ! [ -L /var/www ]; then
  rm -rf /var/www
  ln -fs /vagrant /var/www
fi

# Install nginx
sudo apt-get install -y nginx=1.16.*

# Nginx
if [ ! -f /etc/nginx/sites-available/vagrant ]; then
    touch /etc/nginx/sites-available/vagrant
fi

if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

if [ ! -f /etc/nginx/sites-enabled/vagrant ]; then
    ln -s /etc/nginx/sites-available/vagrant /etc/nginx/sites-enabled/vagrant
fi

# Configure host
cat << 'EOF' > /etc/nginx/sites-available/vagrant
server
{
    listen  80;
    root /vagrant;
    index index.html index.htm;
    server_name _;
    location "/"
    {
        try_files $uri $uri/ /index.html?$args;
    }
}
EOF

sudo sed -i 's/sendfile on;/sendfile off;/' /etc/nginx/nginx.conf

sudo service nginx restart

SCRIPT

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/xenial64"
  config.vm.provision :shell, inline: $provisioningScript
  config.vm.network "private_network", type: "dhcp"
end
